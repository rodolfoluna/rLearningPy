import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { rutas, type Credenciales, type DocActividad, type DocAlumno } from "@rlp/nube";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { doc, getDoc } from "firebase/firestore";
import { alumnoNuevo, hayEmuladores, limpiarEmuladores, profesor, servirDist, type Profesor } from "./emuladores";
import { cambiarRed, simularConexion } from "./red";

// Datos móviles con Firebase de verdad (emuladores) y la app compilada, en un celular simulado
// (Chromium, viewport móvil, `navigator.connection` simulado):
//   1. con datos móviles el alumno resuelve una actividad: Firestore NO recibe nada y aparece el
//      punto ámbar;
//   2. "Enviar ahora": el documento llega y la red vuelve a pausarse;
//   3. al pasar a Wi‑Fi se envía solo (y entonces se precarga Python);
//   4. con "Siempre automática" se comporta como antes;
//   5. con red desconocida (escritorio) sincroniza sola.
// Además, la versión nueva de la app no se descarga con datos móviles.
// Se corre con `pnpm e2e:emuladores`.

const dist = resolve("apps/alumno-web/dist");
test.skip(!existsSync(join(dist, "sw.js")), "Compila la versión web: pnpm --filter @rlp/alumno-web build:emulador");
test.skip(({ browserName }) => browserName !== "chromium", "navigator.connection solo existe en Chromium");

const MOVIL = { viewport: { width: 412, height: 915 }, hasTouch: true };
const capturas = "tests/e2e/capturas";
let sitio: Awaited<ReturnType<typeof servirDist>> | null = null;
let prof: Profesor | null = null;
/** Versión de sw.js que sirve el sitio (cambiarla simula una publicación nueva). */
let versionSw = 0;

test.beforeAll(async () => {
  test.skip(!(await hayEmuladores()), "Sin emuladores de Firebase: corre `pnpm e2e:emuladores` (requiere Java 21+).");
  await limpiarEmuladores();
  prof = await profesor();
  sitio = await servirDist(dist, "/rlp/", (ruta, datos) =>
    ruta === "sw.js" && versionSw ? `${datos.toString("utf8")}\n// publicación de prueba ${versionSw}\n` : datos,
  );
});

test.afterAll(async () => {
  await prof?.cerrar();
  await sitio?.cerrar();
});

async function abrir(browser: Browser, red: string | undefined): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext(MOVIL);
  await simularConexion(contexto, red);
  const page = await contexto.newPage();
  await page.goto(sitio!.base);
  await page.waitForFunction(() => crossOriginIsolated === true, null, { timeout: 60_000 });
  return { contexto, page };
}

/** Primer acceso (contraseña temporal → nueva): entrar usa la red aunque sea de datos móviles. */
async function entrar(page: Page, cred: Credenciales) {
  await page.getByLabel("Número de control").fill(cred.control);
  await page.getByLabel("Contraseña").fill(cred.clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Elige tu contraseña" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("mi-clave-segura");
  await page.getByLabel("Repite la contraseña nueva").fill("mi-clave-segura");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /¡Hola,/ })).toBeVisible({ timeout: 30_000 });
}

const menu = (page: Page) => page.getByRole("button", { name: "Menú", exact: true });

async function responder(page: Page, texto: RegExp) {
  if (!(await page.locator(".opcion").isVisible())) {
    await menu(page).click();
    await page.locator('[data-actividad="u0-que-hace-print"]').click();
  }
  await page.locator("label.op", { hasText: texto }).click();
  await page.getByRole("button", { name: "Verificar" }).click();
}

async function actividad(cred: Credenciales): Promise<DocActividad | undefined> {
  return (await getDoc(doc(prof!.db, rutas.actividad(cred.alumnoId, "u0-que-hace-print")))).data() as DocActividad | undefined;
}

test("datos móviles: Firestore en pausa, Enviar ahora y Wi‑Fi", async ({ browser }) => {
  test.setTimeout(300_000);
  const cred = await alumnoNuevo(prof!, "21349101", "Rosa Datos");
  const { contexto, page } = await abrir(browser, "cellular");
  await entrar(page, cred);
  const sync = page.locator("[data-sync]");
  await expect(sync).toHaveAttribute("data-sync", "en-pausa", { timeout: 30_000 });
  // La contraseña inicial sí se envió (usa la red aunque esté en pausa).
  await expect
    .poll(async () => ((await getDoc(doc(prof!.db, rutas.alumno(cred.alumnoId)))).data() as DocAlumno).debeCambiarClave)
    .toBe(false);

  // 1. Resolver con datos móviles: queda en el teléfono.
  await responder(page, /Muestra la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
  await page.waitForTimeout(5000);
  expect(await actividad(cred)).toBeUndefined();
  expect(await page.evaluate((id) => localStorage.getItem(`rlp-pendientes-desde:${id}`), cred.alumnoId)).toBeTruthy();
  // Python no se precarga con datos móviles.
  expect(await page.evaluate(() => localStorage.getItem("rlp-sin-conexion"))).toBeNull();
  await page.screenshot({ path: `${capturas}/nube-datos-01-pendiente.png` });

  // 2. "Enviar ahora" (desde el indicador → menú ☰): llega y se vuelve a pausar.
  await sync.click();
  await page.locator("#panel-lateral [data-enviar-ahora]").click();
  await expect.poll(async () => (await actividad(cred))?.completada, { timeout: 30_000 }).toBe(true);
  await expect(sync).toHaveAttribute("data-sync", "en-pausa", { timeout: 30_000 });
  const alumno = (await getDoc(doc(prof!.db, rutas.alumno(cred.alumnoId)))).data() as DocAlumno;
  expect(alumno.redUltimaSync).toBe("celular");
  expect(await page.evaluate((id) => localStorage.getItem(`rlp-pendientes-desde:${id}`), cred.alumnoId)).toBeNull();
  await page.keyboard.press("Escape");

  await responder(page, /Guarda la palabra/);
  await expect(sync).toHaveAttribute("data-sync", "pendiente-datos");
  await page.waitForTimeout(4000);
  expect((await actividad(cred))?.intentos).toBe(1);

  // 3. Wi‑Fi: se envía solo, sin mensajes; y ahora sí se precarga Python.
  await cambiarRed(page, "wifi");
  await expect.poll(async () => (await actividad(cred))?.intentos, { timeout: 30_000 }).toBe(2);
  await expect(sync).toHaveAttribute("data-sync", "sincronizado", { timeout: 30_000 });
  await expect(page.locator("[data-recordatorio-sync]")).toHaveCount(0);
  await page.waitForFunction(() => localStorage.getItem("rlp-sin-conexion"), null, { timeout: 120_000 });
  await page.screenshot({ path: `${capturas}/nube-datos-02-wifi.png` });

  // De vuelta a datos móviles: se pausa otra vez.
  await cambiarRed(page, "cellular");
  await expect(sync).toHaveAttribute("data-sync", "en-pausa");
  await contexto.close();
});

test("datos móviles con «Siempre automática»: como antes", async ({ browser }) => {
  test.setTimeout(180_000);
  const cred = await alumnoNuevo(prof!, "21349102", "Iván Siempre");
  const { contexto, page } = await abrir(browser, "cellular");
  await entrar(page, cred);
  await menu(page).click();
  await page.locator("#panel-lateral").getByRole("radiogroup", { name: "Sincronización" }).locator('input[value="siempre"]').check();
  await page.keyboard.press("Escape");
  await responder(page, /Muestra la palabra/);
  await expect.poll(async () => (await actividad(cred))?.completada, { timeout: 30_000 }).toBe(true);
  await expect(page.locator("[data-sync]")).toHaveAttribute("data-sync", "sincronizado", { timeout: 30_000 });
  await contexto.close();
});

test("red desconocida (escritorio, iPhone): sincroniza sola", async ({ browser }) => {
  test.setTimeout(180_000);
  const cred = await alumnoNuevo(prof!, "21349103", "Lía Escritorio");
  const { contexto, page } = await abrir(browser, undefined);
  await entrar(page, cred);
  await responder(page, /Muestra la palabra/);
  await expect.poll(async () => (await actividad(cred))?.completada, { timeout: 30_000 }).toBe(true);
  await expect(page.locator("[data-sync]")).toHaveAttribute("data-sync", "sincronizado", { timeout: 30_000 });
  await contexto.close();
});

/** Pide al navegador que revise si hay versión nueva (como al abrir la app). */
async function revisarVersion(page: Page) {
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r?.update().catch(() => undefined);
  });
}

async function esperarControl(page: Page) {
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller && !!(await navigator.serviceWorker.ready).active);
}

test("versión nueva de la app: con datos móviles se pospone hasta el Wi‑Fi", async ({ browser }) => {
  test.setTimeout(180_000);
  versionSw++;
  const { contexto, page } = await abrir(browser, "cellular");
  await esperarControl(page);
  versionSw++;
  await revisarVersion(page);
  await expect(page.getByText("Se descargará cuando tengas Wi‑Fi")).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(false);
  await expect(page.getByText("Hay una versión nueva de la app.")).toHaveCount(0);
  await page.screenshot({ path: `${capturas}/nube-datos-03-version-pospuesta.png` });

  await cambiarRed(page, "wifi");
  await expect(page.getByText("Hay una versión nueva de la app.")).toBeVisible({ timeout: 60_000 });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.screenshot({ path: `${capturas}/nube-datos-04-version-nueva-360.png` });
  await contexto.close();
});

test("versión nueva de la app: «Descargar ahora» con datos móviles", async ({ browser }) => {
  test.setTimeout(180_000);
  versionSw++;
  const { contexto, page } = await abrir(browser, "cellular");
  await esperarControl(page);
  versionSw++;
  await revisarVersion(page);
  const barra = page.getByRole("status").filter({ hasText: "Se descargará cuando tengas Wi‑Fi" });
  await expect(barra).toBeVisible({ timeout: 30_000 });
  // En un celular angosto: texto a todo lo ancho y el botón abajo, sin columnas apretadas.
  await page.setViewportSize({ width: 360, height: 740 });
  const texto = await barra.locator(".rlp-barra-texto").boundingBox();
  const boton = await barra.getByRole("button", { name: "Descargar ahora" }).boundingBox();
  expect(texto!.width).toBeGreaterThan(250);
  expect(boton!.y).toBeGreaterThanOrEqual(texto!.y + texto!.height - 1);
  await page.screenshot({ path: `${capturas}/nube-datos-03b-version-pospuesta-360.png` });
  await barra.getByRole("button", { name: "Descargar ahora" }).click();
  await expect(page.getByText("Hay una versión nueva de la app.")).toBeVisible({ timeout: 60_000 });
  await contexto.close();
});
