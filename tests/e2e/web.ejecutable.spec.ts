import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";

// "Crear programa .exe": la app descarga el lanzador (aquí uno falso y pequeño, servido por la
// prueba), le pega el código al final con el formato que lee lanzador/src/remolque.rs y lo
// entrega como descarga. La segunda vez usa la caché "rlp-lanzador" sin volver a descargarlo.

// Solo en computadoras: el botón no aparece en celulares ni tabletas, ni con la ventana angosta.

const capturas = "tests/e2e/capturas";
const UA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const botonExe = (page: Page) => page.getByRole("button", { name: "⚙ Crear programa .exe" });

async function entrarComoAlumno(page: Page, control: string) {
  await page.goto("/?simulado");
  await page.getByLabel("Número de control").fill(control);
  await page.getByLabel("Contraseña").fill("gato-1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Contraseña nueva", { exact: true }).fill("contraseña-web");
  await page.getByLabel("Repite la contraseña nueva").fill("contraseña-web");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Hola, Alumno/ })).toBeVisible();
}

/** Lee el remolque: [nombre][len]["RLPNOMBR"][script][len]["RLPSCRPT"] al final del archivo. */
function leerRemolque(exe: Buffer) {
  const bloque = (fin: number, magia: string) => {
    expect(exe.subarray(fin - 8, fin).toString("latin1")).toBe(magia);
    const largo = exe.readUInt32LE(fin - 12);
    return { texto: exe.subarray(fin - 12 - largo, fin - 12).toString("utf8"), inicio: fin - 12 - largo };
  };
  const script = bloque(exe.length, "RLPSCRPT");
  const nombre = bloque(script.inicio, "RLPNOMBR");
  return { script: script.texto, nombre: nombre.texto, inicioRemolque: nombre.inicio };
}

test.describe("en una computadora", () => {
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: UA_WINDOWS, isMobile: false, hasTouch: false });

  test("crear programa .exe: descarga con el remolque correcto y usa la caché", async ({ page, browserName }) => {
    // En WebKit se usa el sitio compilado, con service worker: page.route() no ve esos pedidos.
    test.skip(browserName === "webkit", "page.route() no intercepta pedidos con service worker en WebKit");
    // Lanzador falso de ~300 KB (para ver el avance), con su lanzador.json.
    const lanzador = Buffer.concat([Buffer.from("MZ lanzador de prueba\n"), Buffer.alloc(300_000, 0x41)]);
    const info = { version: "prueba", python: "3.14.8", tamano: lanzador.length, sha256: createHash("sha256").update(lanzador).digest("hex") };
    let descargasLanzador = 0;
    await page.route("**/lanzador/rlp-lanzador.exe", (ruta) => {
      descargasLanzador++;
      return ruta.fulfill({ body: lanzador, contentType: "application/octet-stream" });
    });
    await page.route("**/lanzador/lanzador.json", (ruta) => ruta.fulfill({ json: info }));

    await entrarComoAlumno(page, "21340502");
    await page.locator('[data-actividad="u0-hola-mundo"]').click();
    const editor = page.locator("[data-editor] .cm-content");
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    await page.keyboard.type('print("¡Hola, año!")', { delay: 10 });

    await botonExe(page).click();
    await page.getByLabel("Nombre del programa").fill("Mi saludo: año");
    await expect(page.getByText("Se guardará como")).toContainText("Mi saludo_ año.exe");
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Crear y descargar" }).click()]);
    expect(descarga.suggestedFilename()).toBe("Mi saludo_ año.exe");
    const exe = readFileSync((await descarga.path())!);
    expect(exe.subarray(0, lanzador.length).equals(lanzador)).toBe(true);
    const r = leerRemolque(exe);
    expect(r.nombre).toBe("Mi saludo_ año");
    expect(r.script).toContain('print("¡Hola, año!")');
    expect(r.inicioRemolque).toBe(lanzador.length);
    await expect(page.locator("[data-exe-listo]")).toContainText("Mi saludo_ año.exe");
    // La primera vez explica SmartScreen.
    await expect(page.locator("[data-ayuda-exe]")).toContainText("Ejecutar de todas formas");
    await page.screenshot({ path: `${capturas}/web-exe.png` });

    // Segunda vez: el lanzador sale de la caché (no se descarga de nuevo) y la ayuda ya no aparece sola.
    await page.locator("dialog[open] footer").getByRole("button", { name: "Cerrar" }).click();
    await botonExe(page).click();
    await expect(page.locator("[data-ayuda-exe]")).toBeHidden();
    const [otra] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Crear y descargar" }).click()]);
    expect(leerRemolque(readFileSync((await otra.path())!)).nombre).toBe("Mi saludo_ año");
    expect(descargasLanzador).toBe(1);

    // Cuenta en las estadísticas del alumno.
    await page.locator("dialog[open] footer").getByRole("button", { name: "Cerrar" }).click();
    await page.getByTitle("Tus estadísticas (tu profesor también las ve)").click();
    await expect(page.locator(".tarjeta", { hasText: "Programas .exe creados" })).toContainText("2");
  });

  test("el botón se oculta con la ventana angosta y vuelve al agrandarla", async ({ page }) => {
    await entrarComoAlumno(page, "21340503");
    await page.locator('[data-actividad="u0-hola-mundo"]').click();
    await expect(botonExe(page)).toBeVisible();
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(botonExe(page)).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(botonExe(page)).toBeVisible();
  });
});

test.describe("en un celular", () => {
  // Pantalla y user agent de un celular Android.
  test.use({ viewport: { width: 360, height: 740 }, userAgent: devices["Pixel 7"].userAgent, hasTouch: true });

  test("no se ofrece crear programas .exe", async ({ page }) => {
    await entrarComoAlumno(page, "21340504");
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await page.locator('[data-actividad="u0-hola-mundo"]').click();
    await page.locator("[data-pestanas-movil]").getByRole("tab", { name: "Código" }).click();
    await expect(page.locator("[data-editor] .cm-content")).toBeVisible();
    await expect(botonExe(page)).toHaveCount(0);
  });
});

test.describe("en una tableta grande", () => {
  // Pantalla de computadora, pero user agent de tableta Android: tampoco.
  test.use({ viewport: { width: 1280, height: 800 }, userAgent: devices["Galaxy Tab S9"].userAgent, hasTouch: true });

  test("no se ofrece crear programas .exe", async ({ page }) => {
    await entrarComoAlumno(page, "21340505");
    await page.locator('[data-actividad="u0-hola-mundo"]').click();
    await expect(page.locator("[data-editor] .cm-content")).toBeVisible();
    await expect(botonExe(page)).toHaveCount(0);
  });
});
