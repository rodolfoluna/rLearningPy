import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { hayEmuladores, limpiarEmuladores, profesor, servirDist, type Profesor } from "./emuladores";

// Flujo completo profesor ↔ alumno con la app compilada (como en GitHub Pages, bajo /rlp/) y los
// emuladores de Firebase:
//   el profesor entra, crea un grupo y un alumno (contraseña temporal) → el alumno entra, cambia
//   su contraseña y sin conexión resuelve una actividad → al volver la red el tablero del profesor
//   muestra el avance → el profesor revisa el código y califica (el alumno ve la nota) →
//   restablece la contraseña y el alumno entra con la nueva sin perder su progreso.
// Se corre con `pnpm e2e:emuladores`.

const dist = resolve("apps/alumno-web/dist");
test.skip(!existsSync(join(dist, "sw.js")), "Compila la versión web: pnpm --filter @rlp/alumno-web build:emulador");

const CORREO = "profe@escuela.mx";
const CLAVE = "profe-12345";
let sitio: Awaited<ReturnType<typeof servirDist>> | null = null;
let prof: Profesor | null = null;

test.beforeAll(async () => {
  test.skip(!(await hayEmuladores()), "Sin emuladores de Firebase: corre `pnpm e2e:emuladores` (requiere Java 21+).");
  await limpiarEmuladores();
  prof = await profesor(CORREO, CLAVE);
  sitio = await servirDist(dist);
});

test.afterAll(async () => {
  await prof?.cerrar();
  await sitio?.cerrar();
});

async function abrir(page: Page) {
  await page.goto(sitio!.base);
  await page.waitForFunction(() => crossOriginIsolated === true, null, { timeout: 60_000 });
}

async function entrar(page: Page, usuario: string, clave: string) {
  await page.getByLabel("Número de control").fill(usuario);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function primerAcceso(browser: Browser, control: string, temporal: string, nueva: string) {
  const contexto = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await contexto.newPage();
  await abrir(page);
  await entrar(page, control, temporal);
  await expect(page.getByRole("heading", { name: "Elige tu contraseña" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Contraseña nueva", { exact: true }).fill(nueva);
  await page.getByLabel("Repite la contraseña nueva").fill(nueva);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  return { contexto, page };
}

test("profesor y alumno en la nube: alta, avance sin conexión, calificación y restablecer", async ({ page, browser }) => {
  test.setTimeout(360_000);

  // --- Profesor: entra con su correo, crea un grupo y un alumno.
  await abrir(page);
  await entrar(page, CORREO, CLAVE);
  await expect(page.locator("[data-area-profesor]")).toBeVisible({ timeout: 30_000 });
  const secciones = page.getByLabel("Secciones");
  await secciones.getByRole("button", { name: "👥 Grupos" }).click();
  await page.getByRole("button", { name: "＋ Nuevo grupo" }).click();
  await page.getByLabel("Nombre del grupo").fill("Programación 1A");
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.locator('[data-grupo="Programación 1A"]')).toBeVisible();

  await secciones.getByRole("button", { name: "🎓 Alumnos" }).click();
  await page.getByLabel("Grupo", { exact: true }).selectOption({ label: "Programación 1A" });
  await page.getByLabel("Número de control").fill("21340700");
  await page.getByLabel("Nombre completo").fill("Mario Nube");
  await page.getByRole("button", { name: "Crear alumno" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: "Alumno creado: Mario Nube" })).toBeVisible({ timeout: 30_000 });
  const temporal = (await dialogo.locator('[data-credencial="21340700"] [data-clave]').textContent())!.trim();
  expect(temporal).toMatch(/^[a-z-]+-\d{4}$/);
  await dialogo.getByRole("button", { name: "Listo" }).click();

  await secciones.getByRole("button", { name: "📊 Tablero" }).click();
  const fila = page.locator('tr[data-alumno="21340700"]');
  await expect(fila).toContainText("no ha entrado");
  await expect(fila.locator("[data-avance]")).toHaveAttribute("data-avance", /^0\//);

  // --- Alumno: primer acceso con la contraseña temporal.
  const alumno = await primerAcceso(browser, "21340700", temporal, "mi-clave-segura");
  const pa = alumno.page;
  await expect(pa.getByRole("heading", { name: /Hola, Mario/ })).toBeVisible({ timeout: 30_000 });
  await expect(pa.locator('[data-sync="sincronizado"]')).toBeVisible({ timeout: 30_000 });
  await expect(fila).not.toContainText("no ha entrado", { timeout: 30_000 });
  // Pyodide queda guardado para usarlo sin conexión.
  await pa.waitForFunction(() => localStorage.getItem("rlp-sin-conexion"), null, { timeout: 120_000 });

  // Sin conexión resuelve una actividad.
  await alumno.contexto.setOffline(true);
  await pa.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(pa.locator('[data-sync="sin-conexion"]')).toBeVisible();
  await pa.locator('[data-actividad="u0-hola-mundo"]').click();
  const editor = pa.locator("[data-editor] .cm-content");
  await editor.click();
  await pa.keyboard.press("Control+A");
  await pa.keyboard.press("Delete");
  await pa.keyboard.type('print("Hola, mundo")', { delay: 15 });
  await pa.getByRole("button", { name: "✔ Probar" }).click();
  await expect(pa.getByText(/Actividad completada/)).toBeVisible({ timeout: 90_000 });

  // El profesor aún no lo ve (el alumno no tiene red).
  await page.waitForTimeout(2000);
  await expect(fila.locator("[data-avance]")).toHaveAttribute("data-avance", /^0\//);

  // Vuelve la red: el tablero se actualiza solo.
  await alumno.contexto.setOffline(false);
  await pa.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(pa.locator('[data-sync="sincronizado"]')).toBeVisible({ timeout: 60_000 });
  await expect(fila.locator("[data-avance]")).toHaveAttribute("data-avance", /^1\//, { timeout: 60_000 });
  await expect(fila.locator("[data-puntos]")).toHaveText("10");
  await page.screenshot({ path: "tests/e2e/capturas/nube-01-tablero.png" });

  // --- Profesor: revisa el código y califica; el alumno ve la nota.
  await fila.click();
  await page.locator('[data-act="u0-hola-mundo"]').click();
  await expect(page.locator("[data-visor] .cm-content")).toContainText('print("Hola, mundo")');
  await expect(page.getByText("se reconstruye tecla a tecla")).toBeVisible();
  await page.getByLabel("Calificación").fill("10");
  await page.getByRole("textbox", { name: /Comentario/ }).fill("Excelente");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Calificación guardada.")).toBeVisible();
  await expect(pa.locator("[data-retroalimentacion]")).toContainText("Excelente", { timeout: 30_000 });
  await expect(pa.locator("[data-retroalimentacion]")).toContainText("Calificación 10");

  // --- Restablecer: contraseña temporal nueva; la anterior deja de servir; el progreso sigue.
  await page.getByRole("button", { name: /Restablecer contraseña/ }).click();
  await page.getByRole("button", { name: "Generar contraseña nueva" }).click();
  await expect(dialogo.getByRole("heading", { name: "Contraseña nueva de Mario Nube" })).toBeVisible({ timeout: 30_000 });
  const nuevaTemporal = (await dialogo.locator("[data-clave]").textContent())!.trim();
  expect(nuevaTemporal).not.toBe(temporal);
  await dialogo.getByRole("button", { name: "Listo" }).click();
  await alumno.contexto.close();

  const otro = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const po = await otro.newPage();
  await abrir(po);
  await entrar(po, "21340700", "mi-clave-segura");
  await expect(po.getByText("Número de control o contraseña incorrectos.")).toBeVisible({ timeout: 30_000 });
  await otro.close();

  const despues = await primerAcceso(browser, "21340700", nuevaTemporal, "otra-clave-segura");
  await expect(despues.page.getByRole("heading", { name: /Hola, Mario/ })).toBeVisible({ timeout: 30_000 });
  await expect(despues.page.locator('[data-actividad="u0-hola-mundo"] .marca')).toHaveText("✓");
  await despues.contexto.close();
});
