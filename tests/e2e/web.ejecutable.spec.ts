import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// "Crear programa .exe": la app descarga el lanzador (aquí uno falso y pequeño, servido por la
// prueba), le pega el código al final con el formato que lee lanzador/src/remolque.rs y lo
// entrega como descarga. La segunda vez usa la caché "rlp-lanzador" sin volver a descargarlo.

const capturas = "tests/e2e/capturas";

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

  await page.getByRole("button", { name: "⚙ Crear programa .exe" }).click();
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
  await page.getByRole("button", { name: "⚙ Crear programa .exe" }).click();
  await expect(page.locator("[data-ayuda-exe]")).toBeHidden();
  const [otra] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Crear y descargar" }).click()]);
  expect(leerRemolque(readFileSync((await otra.path())!)).nombre).toBe("Mi saludo_ año");
  expect(descargasLanzador).toBe(1);

  // Cuenta en las estadísticas del alumno.
  await page.locator("dialog[open] footer").getByRole("button", { name: "Cerrar" }).click();
  await page.getByTitle("Tus estadísticas (tu profesor también las ve)").click();
  await expect(page.locator(".tarjeta", { hasText: "Programas .exe creados" })).toContainText("2");
});
