// Estado global de la App Alumno.

import type { Curso } from "@rlp/curso";
import cursoJson from "@rlp/curso/alumno.json";
import type { PoliticaPegado } from "@rlp/editor";
import { EjecutorPython, type OpcionesEjecutor } from "@rlp/python-worker";
import { backend } from "./backend";
import type { EstadoActividad, EstadoAlumno, EstadoApp, EstadoSincronizacion, SesionIniciada } from "./tipos";

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
  void python.iniciar().catch(() => undefined);
}

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
    b.alSincronizar((e) => (app.sincronizacion = e)),
    b.alCambiarAlumno((e) => {
      if (!app.alumno || app.alumno.perfil.perfil_id !== e.perfil.perfil_id) return;
      app.alumno.grupo = e.grupo;
      app.alumno.debe_cambiar_clave = e.debe_cambiar_clave;
      for (const [id, a] of Object.entries(e.actividades)) app.alumno.actividades[id] = a;
    }),
  ];
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
