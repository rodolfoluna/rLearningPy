import { expect, test, type Page } from "@playwright/test";
import { esperarEntrada, registrarErrores } from "./web.diagnostico";

// La app web con el núcleo simulado (en memoria, `?simulado`): pantalla de acceso común, cambio de
// contraseña obligatorio, input(), bloqueo de pegado fuera del editor y entrada del profesor.
// Las cuentas de demostración están en packages/alumno-ui/src/lib/backend-simulado.ts.

const capturas = "tests/e2e/capturas";

async function entrarComoAlumno(page: Page, control: string) {
  await page.goto("/?simulado");
  await page.getByLabel("Número de control").fill(control);
  await page.getByLabel("Contraseña").fill("gato-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Elige tu contraseña" })).toBeVisible();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("corta");
  await page.getByLabel("Repite la contraseña nueva").fill("corta");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByText("al menos 8 caracteres").last()).toBeVisible();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("contraseña-web");
  await page.getByLabel("Repite la contraseña nueva").fill("contraseña-web");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Alumno/ })).toBeVisible();
}

test("acceso, cambio de contraseña, input() y pegado bloqueado", async ({ page }) => {
  const errores = registrarErrores(page);
  await entrarComoAlumno(page, "21340500");
  await expect(page.locator('[data-sync="sincronizado"]')).toBeVisible();

  await page.locator('[data-actividad="u0-hola-mundo"]').click();
  const editor = page.locator("[data-editor] .cm-content");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type('nombre = input("Nombre: ")\nprint("Hola,", nombre)', { delay: 10 });
  await page.getByRole("button", { name: "▶ Ejecutar" }).click();
  const dato = page.getByLabel("Dato para el programa");
  await esperarEntrada(page, dato, errores);
  await page.evaluate(() => navigator.clipboard.writeText("pegado"));
  await dato.focus();
  await page.keyboard.press("Control+V");
  await expect(dato).toHaveValue("");
  await dato.fill("Web");
  await dato.press("Enter");
  await expect(page.locator("[data-consola]")).toContainText("Hola, Web");
  await expect(page.locator('[data-contador="pegados"] strong')).toHaveText("1");
  await page.screenshot({ path: `${capturas}/web-01-input.png` });

  // Predicción: pegar en la respuesta tampoco inserta nada.
  await page.locator('[data-actividad="u0-predice-comentarios"]').click();
  const respuesta = page.getByLabel("¿Qué mostrará en la consola?");
  await respuesta.focus();
  await page.keyboard.press("Control+V");
  await expect(respuesta).toHaveValue("");
  await expect(page.locator('[data-contador="pegados"] strong')).toHaveText("2");
});

test("contraseña incorrecta y entrada del profesor", async ({ page }) => {
  await page.goto("/?simulado");
  await page.getByLabel("Número de control").fill("21340501");
  await page.getByLabel("Contraseña").fill("otra-cosa");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Número de control o contraseña incorrectos.")).toBeVisible();

  await page.getByLabel("Número de control").fill("profesor@demo.local");
  await page.getByLabel("Contraseña").fill("profesor-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("[data-area-profesor]")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Número de control")).toBeVisible();
});
