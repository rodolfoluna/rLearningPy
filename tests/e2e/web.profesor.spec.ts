import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Área del profesor con datos simulados (`?simulado`, ver
// apps/alumno-web/src/rol/profesor/lib/datos-simulado.ts): tablero, detalle, reproducción,
// calificación, alta de alumnos con credenciales, restablecer contraseña y grupos.

const capturas = "tests/e2e/capturas";

async function entrarComoProfesor(page: Page) {
  await page.goto("/?simulado");
  await page.getByLabel("Número de control").fill("profesor@demo.local");
  await page.getByLabel("Contraseña").fill("profesor-demo");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("[data-area-profesor]")).toBeVisible();
  await expect(page.locator("tr[data-alumno]")).toHaveCount(4);
}

test("tablero: alertas, orden, filtro por grupo y CSV", async ({ page }) => {
  await entrarComoProfesor(page);
  await expect(page.locator('tr[data-alumno="21340001"] [data-nivel]')).toHaveAttribute("data-nivel", "verde");
  await expect(page.locator('tr[data-alumno="21340002"] [data-nivel]')).toHaveAttribute("data-nivel", "amarillo");
  await expect(page.locator('tr[data-alumno="21340003"] [data-nivel]')).toHaveAttribute("data-nivel", "rojo");
  await expect(page.locator('tr[data-alumno="21340001"] [data-puntos]')).toHaveText("25");
  await page.screenshot({ path: `${capturas}/profesor-01-tablero.png` });

  // Ordenar por puntos (de mayor a menor).
  await page.getByRole("button", { name: /^Puntos/ }).click();
  await expect(page.locator("tr[data-alumno]").first()).toHaveAttribute("data-alumno", "21340001");
  await expect(page.locator("tr[data-alumno]").last()).toHaveAttribute("data-alumno", "21340004");

  // Filtro por grupo.
  await page.getByLabel("Filtrar por grupo").selectOption({ label: "Sin grupo" });
  await expect(page.locator("tr[data-alumno]")).toHaveCount(1);
  await page.getByLabel("Filtrar por grupo").selectOption({ label: "Programación 1A" });
  await expect(page.locator("tr[data-alumno]")).toHaveCount(3);

  await page.getByLabel("Ver mapa de actividades").check();
  await page.screenshot({ path: `${capturas}/profesor-02-mapa.png` });

  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: /CSV de avance/ }).click();
  const csv = readFileSync(await (await descarga).path(), "utf8");
  expect(csv.split("\r\n")[0]).toContain("Número de control,Nombre,Grupo,Completadas");
  expect(csv).toContain("21340001,Ana López,Programación 1A,3,");
  expect(csv).not.toContain("Carla");
});

test("detalle: código, pruebas, calificación y reproducción", async ({ page }) => {
  await entrarComoProfesor(page);
  await page.locator('tr[data-alumno="21340001"]').click();
  await expect(page.getByRole("heading", { name: "Ana López" })).toBeVisible();
  await page.locator('[data-act="u1-suma-dos-numeros"]').click();
  await expect(page.locator("[data-visor] .cm-content")).toContainText("La suma es");
  await expect(page.getByText("se reconstruye tecla a tecla")).toBeVisible();
  await page.getByRole("button", { name: /Volver a correr las pruebas/ }).click();
  await expect(page.getByText("Pasaron 3 de 3")).toBeVisible({ timeout: 90_000 });
  await page.getByLabel("Calificación").fill("9,5");
  await page.getByRole("textbox", { name: /Comentario/ }).fill("Buen trabajo");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Calificación guardada.")).toBeVisible();
  await expect(page.locator('[data-act="u1-suma-dos-numeros"] .insignia')).toHaveText("9.5");
  await page.screenshot({ path: `${capturas}/profesor-04-actividad.png` });

  // Bruno pegó (permitido) parte del código: aparece como marca en la reproducción.
  await page.getByRole("button", { name: "← Tablero" }).click();
  await page.locator('tr[data-alumno="21340002"]').click();
  await page.locator('[data-act="u1-suma-dos-numeros"]').click();
  await page.locator("[data-ver-reproduccion]").click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: /Cómo escribió: Suma de dos números/ })).toBeVisible();
  await expect(dialogo.locator(".marca.pegado")).toHaveCount(1);
  await dialogo.getByLabel("Velocidad").selectOption("100");
  await dialogo.locator("[data-reproducir]").click();
  await expect(dialogo.locator("[data-coincide]")).toBeVisible({ timeout: 30_000 });
  await expect(dialogo.locator("[data-reproductor-visor] .cm-content")).toContainText("La suma es");
  await page.screenshot({ path: `${capturas}/profesor-06-reproductor.png` });
  await dialogo.getByLabel("Posición en el historial").fill("0");
  await expect(dialogo.locator("[data-coincide]")).toHaveCount(0);
});

test("alumnos: alta en lote con credenciales, restablecer y grupos", async ({ page }) => {
  await entrarComoProfesor(page);
  await page.getByLabel("Secciones").getByRole("button", { name: "👥 Grupos" }).click();
  await page.getByRole("button", { name: "＋ Nuevo grupo" }).click();
  await page.getByLabel("Nombre del grupo").fill("Programación 1B");
  await page.getByLabel(/solo lo que el alumno copió/).check();
  await page.screenshot({ path: `${capturas}/profesor-05-nuevo-grupo.png` });
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await expect(page.locator('[data-grupo="Programación 1B"]')).toContainText("solo lo copiado dentro de la app");

  await page.getByLabel("Secciones").getByRole("button", { name: "🎓 Alumnos" }).click();
  await page.getByLabel("Grupo", { exact: true }).selectOption({ label: "Programación 1B" });
  await page.getByText("Varios a la vez").click();
  await page.getByLabel("Lista de alumnos").fill("control,nombre\n21340100,Elena Torres\n21340101;Fernando Díaz\nmal control,X\n21340001,Ana Repetida");
  await expect(page.getByText("3 alumno(s) listos, 1 línea(s) con problemas")).toBeVisible();
  await page.locator("[data-crear-lista]").click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: "2 alumnos creados" })).toBeVisible();
  await expect(dialogo.locator("[data-credencial]")).toHaveCount(2);
  await expect(dialogo.locator('[data-credencial="21340100"] [data-clave]')).toHaveText(/^[a-z-]+-\d{4}$/);
  await page.screenshot({ path: `${capturas}/profesor-07-credenciales.png` });
  const descarga = page.waitForEvent("download");
  await dialogo.getByRole("button", { name: /Descargar CSV/ }).click();
  const csv = readFileSync(await (await descarga).path(), "utf8");
  expect(csv).toMatch(/21340101,Fernando Díaz,Programación 1B,[a-z-]+-\d{4}/);
  await dialogo.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(/Ya existe un alumno con el número de control 21340001/)).toBeVisible();

  // Alta individual sin grupo, edición y restablecer.
  await page.getByLabel("Grupo", { exact: true }).selectOption({ label: "Sin grupo" });
  await page.getByLabel("Número de control").fill("21340102");
  await page.getByLabel("Nombre completo").fill("Gina Ramos");
  await page.getByRole("button", { name: "Crear alumno" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Alumno creado: Gina Ramos" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Listo" }).click();

  const fila = page.locator('[data-fila-alumno="21340102"]');
  await fila.getByRole("button", { name: /Editar/ }).click();
  await page.getByRole("dialog").getByLabel("Grupo").selectOption({ label: "Programación 1B" });
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(fila).toContainText("Programación 1B");

  await fila.getByRole("button", { name: /Restablecer contraseña/ }).click();
  await page.getByRole("button", { name: "Generar contraseña nueva" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Contraseña nueva de Gina Ramos" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Listo" }).click();

  await fila.getByRole("button", { name: /Dar de baja/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Dar de baja" }).click();
  await expect(fila).toHaveCount(0);

  await page.getByLabel("Secciones").getByRole("button", { name: "📊 Tablero" }).click();
  await page.getByLabel("Filtrar por grupo").selectOption({ label: "Programación 1B" });
  await expect(page.locator("tr[data-alumno]")).toHaveCount(2);
});
