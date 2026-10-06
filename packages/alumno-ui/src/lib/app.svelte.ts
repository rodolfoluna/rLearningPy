// Estado global de la App Alumno.

import type { Curso } from "@rlp/curso";
import cursoJson from "@rlp/curso/alumno.json";
import type { PoliticaPegado } from "@rlp/editor";
import { alCambiarRed, tipoRed } from "@rlp/nube/red";
import { EjecutorPython, type OpcionesEjecutor } from "@rlp/python-worker";
import { backend } from "./backend";
import type { AjusteSync, EstadoActividad, EstadoAlumno, EstadoApp, EstadoSincronizacion, InfoRed, SesionIniciada } from "./tipos";

export const curso = cursoJson as Curso;

export type Seleccion =
  | { tipo: "inicio" }
  | { tipo: "leccion"; id: string }
  | { tipo: "actividad"; id: string }
  | { tipo: "estadisticas" };

export const app = $state({
  vista: "cargando" as "cargando" | "inicio" | "cambiar-clave" | "principal" | "profesor",
  estadoApp: null as EstadoApp | null,
  alumno: null as EstadoAlumno | null,
  seleccion: { tipo: "inicio" } as Seleccion,
  aviso: "" as string,
  sincronizacion: null as EstadoSincronizacion | null,
  /** Red, ajuste de sincronización y pendientes (si el núcleo los maneja). */
  red: null as InfoRed | null,
  /** Python aún no está descargado, la red es de datos móviles y algo lo necesita: se pregunta. */
  pythonEnEspera: false,
  tema: (localStorageSeguro("rlp-tema") ?? "sistema") as "sistema" | "claro" | "oscuro",
});

/** Pyodide se sirve junto a la app; con `base: "./"` (versión web) la ruta debe ser absoluta. */
function rutaPyodide(): string {
  const base = import.meta.env.BASE_URL;
  return base.startsWith("/") ? `${base}pyodide/` : new URL(`${base}pyodide/`, location.href).href;
}

/** Opciones del intérprete: `iniciarApp` agrega el puente de entrada de la app nativa. */
export const opcionesPython: OpcionesEjecutor = { indexURL: rutaPyodide(), timeoutPruebaMs: 4000 };

/** Intérprete de Python compartido (un solo worker con Pyodide). */
export const python = new EjecutorPython(opcionesPython);

function localStorageSeguro(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function aplicarTema(tema: "sistema" | "claro" | "oscuro") {
  app.tema = tema;
  if (tema === "sistema") document.documentElement.removeAttribute("data-tema");
  else document.documentElement.setAttribute("data-tema", tema);
  try {
    localStorage.setItem("rlp-tema", tema);
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
}

export async function cargarEstadoApp() {
  app.estadoApp = await (await backend()).estadoApp();
}

export function entrar(estado: EstadoAlumno) {
  app.alumno = estado;
  app.seleccion = { tipo: "inicio" };
  app.vista = estado.debe_cambiar_clave ? "cambiar-clave" : "principal";
  // Python se prepara en segundo plano, salvo que haya que descargarlo con datos móviles.
  void puedeDescargarPython().then((si) => {
    if (si) void python.iniciar().catch(() => undefined);
  });
}

// ------------------------------------------------------------ Python con datos móviles

/** Tamaño aproximado de Python (Pyodide) para los avisos. */
export const TAMANO_PYTHON = "≈12 MB";
let pythonAprobado = false;
let esperasPython: { si: () => void; no: (e: Error) => void }[] = [];

/** ¿Python ya está guardado en este equipo? (lo guarda el service worker). */
async function pythonEnCache(): Promise<boolean> {
  try {
    if (!("caches" in globalThis)) return false;
    const base = opcionesPython.indexURL;
    const [wasm, stdlib] = await Promise.all([
      caches.match(new URL("pyodide.asm.wasm", base).href),
      caches.match(new URL("python_stdlib.zip", base).href),
    ]);
    return !!wasm && !!stdlib;
  } catch {
    return false;
  }
}

/** ¿Se puede descargar (o ya está) Python sin preguntar? Con datos móviles y sin caché, no. */
export async function puedeDescargarPython(): Promise<boolean> {
  if (pythonAprobado || python.version || tipoRed() !== "celular") return true;
  return pythonEnCache();
}

let pythonGuardado = false;
void pythonEnCache().then((si) => (pythonGuardado = si));

/**
 * ¿Se puede usar Python sin preguntar? (revisar la sintaxis mientras se escribe no debe descargar
 * 12 MB con datos móviles).
 */
export function pythonDisponible(): boolean {
  return pythonAprobado || !!python.version || pythonGuardado || tipoRed() !== "celular";
}

/**
 * Inicia Python. Si hay que descargarlo con datos móviles, muestra la pregunta ("Descargar con
 * datos móviles" / "Esperar a Wi‑Fi") y espera la respuesta; al pasar a Wi‑Fi sigue sola.
 */
export async function asegurarPython(): Promise<void> {
  if (!(await puedeDescargarPython())) {
    app.pythonEnEspera = true;
    await new Promise<void>((si, no) => esperasPython.push({ si, no }));
  }
  await python.iniciar();
}

function responderPython(error: Error | null) {
  const esperas = esperasPython;
  esperasPython = [];
  app.pythonEnEspera = false;
  for (const e of esperas) error ? e.no(error) : e.si();
}

/** "Descargar Python con datos móviles". */
export function aprobarDescargaPython() {
  pythonAprobado = true;
  responderPython(null);
}

/** "Esperar a Wi‑Fi": lo que esperaba a Python se cancela; con Wi‑Fi se descarga solo. */
export function esperarWifiPython() {
  responderPython(new Error("Python se descargará cuando te conectes a Wi‑Fi."));
}

alCambiarRed((t) => {
  if (t === "celular") return;
  if (esperasPython.length) responderPython(null);
  if (app.alumno) void python.iniciar().catch(() => undefined);
});

/** Lleva a cada quien a su área tras iniciar sesión (o reanudar la sesión guardada). */
export function entrarSesion(s: SesionIniciada) {
  if (s.rol === "profesor") {
    app.alumno = null;
    app.vista = "profesor";
  } else {
    entrar(s.estado);
  }
}

let quitarEscuchas: (() => void)[] = [];

/** Escucha el estado de sincronización y los cambios que llegan de la nube. */
export async function escucharNucleo() {
  const b = await backend();
  quitarEscuchas.forEach((f) => f());
  quitarEscuchas = [
    b.alSincronizar((e) => {
      app.sincronizacion = e;
      app.red = b.infoRed?.() ?? null;
    }),
    b.alCambiarAlumno((e) => {
      if (!app.alumno || app.alumno.perfil.perfil_id !== e.perfil.perfil_id) return;
      app.alumno.grupo = e.grupo;
      app.alumno.debe_cambiar_clave = e.debe_cambiar_clave;
      for (const [id, a] of Object.entries(e.actividades)) app.alumno.actividades[id] = a;
    }),
  ];
}

/** "Enviar ahora" (con datos móviles): no espera, el indicador muestra el avance. */
export async function enviarAhora() {
  (await backend()).enviarAhora?.();
}

export async function cambiarAjusteSync(a: AjusteSync) {
  const b = await backend();
  b.cambiarAjusteSync?.(a);
  app.red = b.infoRed?.() ?? null;
}

export async function salir() {
  await prepararCierre();
  await (await backend()).cerrarSesion();
  app.alumno = null;
  app.vista = "inicio";
  await cargarEstadoApp();
}

/** Celular o tableta (pantalla táctil sin teclado físico). */
export function esMovil(): boolean {
  const p = app.estadoApp?.plataforma;
  return p === "android" || p === "ios";
}

/** Pantalla táctil sin teclado físico (muestra la barra de teclas de código). */
export function esTactil(): boolean {
  if (esMovil()) return true;
  try {
    return matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function politicaPegado(): PoliticaPegado {
  return app.alumno?.grupo?.politicas.pegado ?? "bloquear";
}

export function registrarSalidas(): boolean {
  return app.alumno?.grupo?.politicas.registrar_salidas ?? true;
}

export function actualizarActividad(id: string, estado: EstadoActividad) {
  if (app.alumno) app.alumno.actividades[id] = estado;
}

let temporizadorEstadisticas: ReturnType<typeof setTimeout> | null = null;

/** Recalcula las estadísticas (agrupando llamadas seguidas). */
export function refrescarEstadisticas() {
  if (temporizadorEstadisticas) clearTimeout(temporizadorEstadisticas);
  temporizadorEstadisticas = setTimeout(async () => {
    temporizadorEstadisticas = null;
    if (!app.alumno) return;
    try {
      app.alumno.estadisticas = await (await backend()).estadisticas();
    } catch {
      /* se reintentará con el siguiente evento */
    }
  }, 250);
}

/** Registra un evento informativo y actualiza los contadores. */
export async function registrarEvento(tipo: string, actividad: string | null, datos: Record<string, unknown> = {}) {
  try {
    await (await backend()).registrarEvento(tipo, actividad, datos);
  } finally {
    refrescarEstadisticas();
  }
}

/** Tareas a completar antes de cerrar la app (p. ej. guardar lo tecleado en el editor). */
export const alCerrar = new Set<() => Promise<unknown>>();

export async function prepararCierre() {
  await Promise.allSettled([...alCerrar].map((f) => f()));
  try {
    await (await backend()).vaciar();
  } catch {
    /* sin núcleo todavía */
  }
}

let temporizadorAviso: ReturnType<typeof setTimeout> | null = null;

export function avisar(texto: string, ms = 3500) {
  app.aviso = texto;
  if (temporizadorAviso) clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (app.aviso = ""), ms);
}
