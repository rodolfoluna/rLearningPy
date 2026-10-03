// Estado global de la App Profesor.

import { actividadesDe, type Curso } from "@rlp/curso";
import cursoJson from "@rlp/curso/profesor.json";
import { EjecutorPython } from "@rlp/python-worker";
import { backend } from "./backend";
import type { EstadoApp, GrupoInfo } from "./tipos";

export const curso = cursoJson as Curso;
export const actividades = actividadesDe(curso);

/** Código inicial oficial de cada actividad (para verificar el punto de partida del historial). */
export const codigosIniciales: Record<string, string> = Object.fromEntries(
  actividades.filter((a) => a.tipo === "codigo").map((a) => [a.id, a.codigo_inicial ?? ""]),
);

export type Vista = { tipo: "tablero" } | { tipo: "detalle"; entregaId: number } | { tipo: "grupos" } | { tipo: "importar" };

export const app = $state({
  estado: null as EstadoApp | null,
  vista: { tipo: "tablero" } as Vista,
  grupos: [] as GrupoInfo[],
  grupoId: null as string | null,
  aviso: "",
});

/** Intérprete para volver a correr las pruebas de los alumnos (aislado en WebAssembly). */
export const python = new EjecutorPython({ indexURL: "/pyodide/", timeoutPruebaMs: 4000 });

export async function cargarEstado() {
  app.estado = await (await backend()).estadoApp();
  if (app.estado.desbloqueado) app.grupos = await (await backend()).grupos();
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

export function avisar(texto: string, ms = 4000) {
  app.aviso = texto;
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => (app.aviso = ""), ms);
}
