import { expect, test, type Page } from "@playwright/test";
import { cambiarRed, simularConexion } from "./red";

// Datos móviles en el celular con el núcleo simulado (`?simulado`) y `navigator.connection`
// simulado: el indicador (punto ámbar, "Enviar ahora", Wi‑Fi), el ajuste de sincronización, el
// recordatorio de avances viejos y las descargas pesadas (Python, lanzador del .exe).
// Con Firebase de verdad (emuladores) lo prueba web.nube-datos.spec.ts.

const capturas = "tests/e2e/capturas";
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });
// `navigator.connection` (el tipo de red) solo existe en Chrome: en WebKit no hay nada que probar.
test.skip(({ browserName }) => browserName !== "chromium", "navigator.connection solo existe en Chromium");

async function entrar(page: Page, control: string, consulta = "") {
  await page.goto(`/?simulado${consulta}`);
  await page.getByLabel("Número de control").fill(control);
  await page.getByLabel("Contraseña").fill("gato-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("contraseña-movil");
  await page.getByLabel("Repite la contraseña nueva").fill("contraseña-movil");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Alumno/ })).toBeVisible();
}

const menu = (page: Page) => page.getByRole("button", { name: "Menú", exact: true });

async function abrirActividad(page: Page, id: string) {
  await menu(page).click();
  await page.locator(`[data-actividad="${id}"]`).click();
  await expect(menu(page)).toHaveAttribute("aria-expanded", "false");
}

/** Responde una pregunta de opción múltiple (cada respuesta, correcta o no, se guarda). */
async function responder(page: Page, id: string, texto: RegExp) {
  if (!(await page.locator(`.opcion`).isVisible())) await abrirActividad(page, id);
  await page.locator("label.op", { hasText: texto }).click();
  await page.getByRole("button", { name: "Verificar" }).click();
}

test("datos móviles: punto ámbar, Enviar ahora, Wi‑Fi y ajuste", async ({ page, context }) => {
  await simularConexion(context, "cellular");
  await entrar(page, "21349001");
  const sync = page.locator("[data-sync]");
  await expect(sync).toHaveAttribute("data-sync", "en-pausa");

  // Resolver con datos móviles: queda pendiente (nube con punto ámbar, solo ícono en la barra).
  await responder(page, "u0-que-hace-print", /Muestra la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
  expect((await sync.locator(".texto").boundingBox())?.width ?? 0).toBeLessThanOrEqual(1); // solo el ícono
  await page.waitForTimeout(400); // que se vaya el aviso de "¡Correcto!"
  await page.locator(".aviso-flotante").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await page.screenshot({ path: `${capturas}/datos-01-pendiente.png` });

  // Tocar el indicador abre el menú ☰ con "Enviar ahora" y el ajuste.
  await sync.click();
  await expect(menu(page)).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#panel-lateral [data-panel-sync]");
  await expect(panel).toContainText("Hay avances sin enviar (datos móviles)");
  await expect(panel.getByLabel("Permitir siempre con datos móviles")).not.toBeChecked();
  await expect(panel.getByLabel("Sincronización")).toHaveValue("wifi");
  await expect.poll(async () => (await page.locator("#panel-lateral").boundingBox())?.x).toBe(0);
  await page.screenshot({ path: `${capturas}/datos-02-menu.png` });

  // Un toque: envía y vuelve a pausar.
  await panel.getByRole("button", { name: "Enviar ahora" }).click();
  await expect(sync).toHaveAttribute("data-sync", "enviando-datos");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${capturas}/datos-03-enviando.png` });
  await expect(sync).toHaveAttribute("data-sync", "en-pausa");

  // Otro avance queda pendiente; al pasar a Wi‑Fi se envía solo, sin mensajes.
  await responder(page, "u0-que-hace-print", /Guarda la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
  await cambiarRed(page, "wifi");
  await expect(sync).toHaveAttribute("data-sync", "sincronizado");
  await expect(page.locator("[data-recordatorio-sync]")).toHaveCount(0);
  await page.screenshot({ path: `${capturas}/datos-04-wifi.png` });

  // "Solo cuando yo lo pida": aun con Wi‑Fi queda pendiente hasta tocar "Enviar ahora".
  await menu(page).click();
  await panel.getByLabel("Sincronización").selectOption("manual");
  await page.keyboard.press("Escape");
  await responder(page, "u0-que-hace-print", /Imprime la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
  await expect(sync).toHaveAttribute("title", "Hay avances sin enviar (envío manual)");

  // "Permitir siempre con datos móviles" (= Siempre automática): con datos móviles se envía solo.
  await cambiarRed(page, "cellular");
  await menu(page).click();
  await panel.getByLabel("Sincronización").selectOption("wifi");
  await panel.getByLabel("Permitir siempre con datos móviles").click(); // ya no hay pendientes: desaparece
  await expect(panel.getByLabel("Sincronización")).toHaveValue("siempre");
  await expect(sync).toHaveAttribute("data-sync", "sincronizado");
  expect(await page.evaluate(() => localStorage.getItem("rlp-sync"))).toBe("siempre");
});

test("Ahorro de datos cuenta como datos móviles; red desconocida sincroniza sola", async ({ page, context }) => {
  await simularConexion(context, undefined);
  await entrar(page, "21349002");
  const sync = page.locator("[data-sync]");
  await expect(sync).toHaveAttribute("data-sync", "sincronizado");
  await cambiarRed(page, "wifi", true);
  await responder(page, "u0-que-hace-print", /Muestra la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
});

test("recordatorio suave de avances de hace días", async ({ page, context }) => {
  await simularConexion(context, "cellular");
  await entrar(page, "21349003", "&pendientes-desde=50");
  const aviso = page.locator("[data-recordatorio-sync]");
  await expect(aviso).toContainText("Tienes avances de hace 2 días sin enviar");
  await page.screenshot({ path: `${capturas}/datos-05-recordatorio.png` });
  await aviso.getByRole("button", { name: "Cerrar recordatorio" }).click();
  await expect(aviso).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("rlp-recordatorio-sync"))).toBe("1");
});

test("descargas pesadas con datos móviles: Python y el lanzador del .exe", async ({ page, context }) => {
  test.setTimeout(150_000);
  await simularConexion(context, "cellular");
  await entrar(page, "21349004");
  await abrirActividad(page, "u0-hola-mundo");
  const pestanas = page.locator("[data-pestanas-movil]");
  await pestanas.getByRole("tab", { name: "Código" }).click();

  // El lanzador: antes de crear el .exe se avisa el tamaño.
  await page.getByRole("button", { name: /Crear programa .exe/ }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.locator("[data-aviso-descarga-exe]")).toContainText("13 MB");
  await expect(dialogo.locator("[data-aviso-descarga-exe]")).toContainText("datos móviles");
  await page.screenshot({ path: `${capturas}/datos-06-exe.png` });
  await dialogo.getByRole("button", { name: /Cancelar|Cerrar/ }).first().click();

  // Python no está guardado (servidor de desarrollo): al ejecutar se pregunta.
  await page.getByRole("button", { name: "▶ Ejecutar" }).click();
  const pregunta = page.locator("[data-descarga-python]");
  await expect(pregunta).toBeVisible();
  await page.screenshot({ path: `${capturas}/datos-07-python.png` });
  await pregunta.getByRole("button", { name: "Esperar a Wi‑Fi" }).click();
  await expect(pregunta).toBeHidden();
  await expect(page.locator(".aviso-flotante")).toContainText("cuando te conectes a Wi‑Fi");

  await pestanas.getByRole("tab", { name: "Código" }).click();
  await page.getByRole("button", { name: "▶ Ejecutar" }).click();
  await pregunta.getByRole("button", { name: /Descargar Python/ }).click();
  await expect(pregunta).toBeHidden();
  await expect(page.locator(".estado-barra")).toContainText("Programa terminado", { timeout: 120_000 });
});
