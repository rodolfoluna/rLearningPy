import { expect, test, type Page } from "@playwright/test";

// La app web en celulares (`?simulado`): sin desplazamiento horizontal, la barra superior se pliega
// en un menú ☰ (alumno y profesor) y al abrir una actividad se ve primero el enunciado.

const capturas = "tests/e2e/capturas";
const pantallas = [
  { width: 360, height: 740 },
  { width: 412, height: 915 },
];

async function sinDesbordeHorizontal(page: Page) {
  const [ancho, vista] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(ancho).toBeLessThanOrEqual(vista);
}

// Espera a que el panel lateral termine de abrirse (x = 0) o de cerrarse (oculto).
async function panelQuieto(page: Page, abierto: boolean) {
  const panel = page.locator("#panel-lateral");
  if (abierto) await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0);
  else await expect(panel).toBeHidden();
}

async function entrarComoAlumno(page: Page, control: string) {
  await page.goto("/?simulado");
  await page.getByLabel("Número de control").fill(control);
  await page.getByLabel("Contraseña").fill("gato-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("contraseña-movil");
  await page.getByLabel("Repite la contraseña nueva").fill("contraseña-movil");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Alumno/ })).toBeVisible();
}

for (const [i, viewport] of pantallas.entries()) {
  test.describe(`celular ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });

    test("alumno: menú ☰, sin desborde y enunciado por defecto", async ({ page }) => {
      await entrarComoAlumno(page, `2134060${i}`);
      await sinDesbordeHorizontal(page);
      const menu = page.getByRole("button", { name: "Menú", exact: true });
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("button", { name: "Cuenta" })).toBeHidden();
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-alumno-inicio.png` });

      // El menú tiene la cuenta, los contadores y el temario; Escape lo cierra.
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("button", { name: "🚪 Cerrar sesión" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Mis estadísticas/ })).toBeVisible();
      await panelQuieto(page, true);
      await sinDesbordeHorizontal(page);
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-alumno-menu.png` });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await panelQuieto(page, false);
      await expect(page.getByRole("button", { name: "🚪 Cerrar sesión" })).toBeHidden();

      // Tocar fuera también lo cierra; elegir una actividad lo cierra y abre el enunciado.
      await menu.click();
      await panelQuieto(page, true);
      await page.mouse.click(viewport.width - 10, viewport.height - 10);
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await panelQuieto(page, false);
      await menu.click();
      await panelQuieto(page, true);
      await page.locator('[data-actividad="u0-hola-mundo"]').click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await panelQuieto(page, false);
      const pestanas = page.locator("[data-pestanas-movil]");
      await expect(pestanas.getByRole("tab", { name: "Enunciado" })).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("section.enunciado")).toBeVisible();
      await expect(page.locator("[data-editor]")).toBeHidden();
      await sinDesbordeHorizontal(page);
      for (const pestana of await pestanas.getByRole("tab").all()) {
        const caja = (await pestana.boundingBox())!;
        expect(caja.x + caja.width).toBeLessThanOrEqual(viewport.width);
      }
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-alumno-actividad.png` });

      // El editor funciona al cambiar de pestaña; al pasar a otra actividad vuelve al enunciado.
      await pestanas.getByRole("tab", { name: "Código" }).click();
      await expect(page.locator("[data-editor] .cm-content")).toBeVisible();
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-alumno-codigo.png` });
      await page.getByRole("button", { name: /Siguiente/ }).click();
      await expect(pestanas.getByRole("tab", { name: "Enunciado" })).toHaveAttribute("aria-selected", "true");

      await menu.click();
      await page.getByRole("button", { name: "🚪 Cerrar sesión" }).click();
      await expect(page.getByLabel("Número de control")).toBeVisible();
    });

    test("profesor: menú ☰ con secciones, grupo y cerrar sesión", async ({ page }) => {
      await page.goto("/?simulado");
      await page.getByLabel("Número de control").fill("profesor@demo.local");
      await page.getByLabel("Contraseña").fill("profesor-demo");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.locator("tr[data-alumno]")).toHaveCount(4);
      await sinDesbordeHorizontal(page);
      const menu = page.getByRole("button", { name: "Menú", exact: true });
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeHidden();
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-profesor.png` });

      await menu.click();
      await expect(page.getByLabel("Filtrar por grupo")).toBeVisible();
      await sinDesbordeHorizontal(page);
      await page.screenshot({ path: `${capturas}/movil-${viewport.width}-profesor-menu.png` });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /Alumnos/ })).toBeHidden();

      await menu.click();
      await page.getByRole("button", { name: "👥 Grupos" }).click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await sinDesbordeHorizontal(page);
      await menu.click();
      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      await expect(page.getByLabel("Número de control")).toBeVisible();
    });
  });
}

test("escritorio: la barra no cambia", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await entrarComoAlumno(page, "21340609");
  await expect(page.getByRole("button", { name: "Menú", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Cuenta" })).toBeVisible();
  await expect(page.locator('[data-contador="pegados"]')).toBeVisible();
  await page.locator('[data-actividad="u0-hola-mundo"]').click();
  await expect(page.locator("section.enunciado")).toBeVisible();
  await expect(page.locator("[data-editor] .cm-content")).toBeVisible();
  await sinDesbordeHorizontal(page);
  await page.screenshot({ path: `${capturas}/escritorio-1280-alumno.png` });
});
