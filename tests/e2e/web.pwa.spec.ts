import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { rutas, type DocActividad, type DocAlumno } from "@rlp/nube";
import { expect, test } from "@playwright/test";
import { doc, getDoc } from "firebase/firestore";
import { alumnoNuevo, hayEmuladores, limpiarEmuladores, profesor, servirDist, type Profesor } from "./emuladores";
import { esperarEntrada, registrarErrores } from "./web.diagnostico";

// La PWA publicada tal como quedaría en GitHub Pages (archivos estáticos en una subcarpeta, sin
// encabezados COOP/COEP del servidor) contra los emuladores de Firebase:
//   el profesor crea al alumno → el alumno entra y cambia su contraseña → sin red recarga la app,
//   resuelve una actividad y usa input() → al volver la red el progreso llega a Firestore.
// Se corre con `pnpm e2e:emuladores` (compila con --mode emulador y levanta los emuladores).

const dist = resolve("apps/alumno-web/dist");
test.skip(!existsSync(join(dist, "sw.js")), "Compila la versión web: pnpm --filter @rlp/alumno-web build:emulador");

let sitio: Awaited<ReturnType<typeof servirDist>> | null = null;
let base = "";
let prof: Profesor | null = null;

test.beforeAll(async () => {
  test.skip(!(await hayEmuladores()), "Sin emuladores de Firebase: corre `pnpm e2e:emuladores` (requiere Java 21+).");
  await limpiarEmuladores();
  prof = await profesor();
  sitio = await servirDist(dist);
  base = sitio.base;
});

test.afterAll(async () => {
  await prof?.cerrar();
  await sitio?.cerrar();
});

test("PWA con Firebase: primer acceso, sin conexión y sincronización", async ({ page, context }) => {
  test.setTimeout(240_000);
  const errores = registrarErrores(page);
  const cred = await alumnoNuevo(prof!, "21340600", "Laura Sin Red");

  await page.goto(base);
  // Primera visita: el service worker recarga la página una vez, ya aislada.
  await page.waitForFunction(() => crossOriginIsolated === true, null, { timeout: 60_000 });
  const manifiesto = await page.evaluate(async () => {
    const enlace = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    return (await fetch(enlace.href)).json();
  });
  expect(manifiesto.display).toBe("standalone");

  // Primer acceso: contraseña temporal y cambio obligatorio.
  await page.getByLabel("Número de control").fill("21340600");
  await page.getByLabel("Contraseña").fill(cred.clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Elige tu contraseña" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("mi-clave-segura");
  await page.getByLabel("Repite la contraseña nueva").fill("mi-clave-segura");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Laura/ })).toBeVisible();
  await expect(page.locator('[data-sync="sincronizado"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => localStorage.getItem("rlp-sin-conexion"), null, { timeout: 120_000 });

  // Sin red: ni el sitio ni Firebase responden. La sesión, la app y Python siguen funcionando.
  await sitio!.cerrar();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Hola, Laura/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-sync="sin-conexion"]')).toContainText("Sin conexión");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await page.locator('[data-actividad="u0-hola-mundo"]').click();
  const editor = page.locator("[data-editor] .cm-content");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type('n = input("Nombre: ")\nprint("Hola,", n)', { delay: 10 });
  await page.getByRole("button", { name: "▶ Ejecutar" }).click();
  const dato = page.getByLabel("Dato para el programa");
  await esperarEntrada(page, dato, errores);

  // Pegar en el dato de input() no inserta nada.
  await page.evaluate(() => navigator.clipboard.writeText("texto pegado"));
  await dato.focus();
  await page.keyboard.press("Control+V");
  await expect(dato).toHaveValue("");
  await dato.fill("sin red");
  await dato.press("Enter");
  await expect(page.locator("[data-consola]")).toContainText("Hola, sin red");

  // Pegar en el editor tampoco.
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+V");
  await expect(editor).not.toContainText("texto pegado");

  // Resolver la actividad sin conexión.
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type('print("Hola, mundo")', { delay: 10 });
  await page.getByRole("button", { name: "✔ Probar" }).click();
  await expect(page.getByText(/Actividad completada/)).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "tests/e2e/capturas/web-03-sin-conexion.png" });

  // Al volver la red, el progreso llega a Firestore (lo que vería el profesor).
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator('[data-actividad="u0-bienvenida"]').click(); // cambiar de actividad vacía lo pendiente
  await expect(page.locator('[data-sync="sincronizado"]')).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => {
      const d = (await getDoc(doc(prof!.db, rutas.actividad(cred.alumnoId, "u0-hola-mundo")))).data() as DocActividad | undefined;
      return d && { completada: d.completada, codigo: d.codigo.trim(), ediciones: (d.ediciones?.length ?? 0) > 0 };
    }, { timeout: 30_000 })
    .toEqual({ completada: true, codigo: 'print("Hola, mundo")', ediciones: true });
  const alumno = (await getDoc(doc(prof!.db, rutas.alumno(cred.alumnoId)))).data() as DocAlumno;
  expect(alumno.debeCambiarClave).toBe(false);
  await expect
    .poll(async () => (await getDoc(doc(prof!.db, rutas.contadores(cred.alumnoId)))).data()?.global?.pegados_intentos ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
});
