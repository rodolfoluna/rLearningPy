// Estado del área del profesor (solo se carga cuando entra el profesor).

import { actividadesDe, type Actividad as ActCurso, type Curso } from "@rlp/curso";
import cursoJson from "@rlp/curso/profesor.json";
import type { Credenciales } from "@rlp/nube";
import { datos } from "./datos";
import type { AlumnoFila, Grupo } from "./tipos";

/** Curso con las soluciones de referencia (este módulo solo lo descarga el profesor). */
export const curso = cursoJson as Curso;
export const actividades: ActCurso[] = actividadesDe(curso);
export const actividadPorId = new Map(actividades.map((a) => [a.id, a]));

export type Vista =
  | { tipo: "tablero" }
  | { tipo: "detalle"; alumnoId: string }
  | { tipo: "alumnos" }
  | { tipo: "grupos" };

export const prof = $state({
  vista: { tipo: "tablero" } as Vista,
  /** Filtro de grupo: null = todos; "" = sin grupo. */
  grupoId: null as string | null,
  alumnos: [] as AlumnoFila[],
  grupos: [] as Grupo[],
  cargando: true,
  error: "",
  /** Credenciales recién generadas (se muestran en un diálogo para descargarlas o imprimirlas). */
  credenciales: null as { titulo: string; grupo: string; lista: Credenciales[] } | null,
});

/** Alumnos del grupo elegido. */
export function alumnosVisibles(): AlumnoFila[] {
  const g = prof.grupoId;
  if (g === null) return prof.alumnos;
  return prof.alumnos.filter((a) => (g === "" ? !a.grupo : a.grupo === g));
}

export function nombreGrupo(id: string | null | undefined): string {
  if (!id) return "Sin grupo";
  return prof.grupos.find((g) => g.id === id)?.nombre ?? "(grupo borrado)";
}

let quitar: (() => void)[] = [];

/** Empieza a escuchar alumnos y grupos (una sola vez mientras el área está abierta). */
export function conectar(): () => void {
  desconectar();
  prof.cargando = true;
  prof.error = "";
  const d = datos();
  const alError = (e: Error) => {
    prof.error = `No se pudieron leer los datos: ${e.message}`;
    prof.cargando = false;
  };
  quitar = [
    d.escucharAlumnos((a) => {
      prof.alumnos = a;
      prof.cargando = false;
    }, alError),
    d.escucharGrupos((g) => (prof.grupos = g), alError),
  ];
  return desconectar;
}

export function desconectar() {
  quitar.forEach((f) => f());
  quitar = [];
}

/** Dirección de la app para las hojas de credenciales. */
export function direccionApp(): string {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}
