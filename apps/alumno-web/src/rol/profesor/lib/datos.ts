// Fuente de datos del área del profesor: Firebase (datos-firebase.ts) o una simulación en
// memoria para desarrollar y probar la interfaz sin nube (datos-simulado.ts).

import type { Credenciales, DocGrupo, NotaProfesor, NuevoAlumno } from "@rlp/nube";
import type { Actividad, AlumnoFila, Grupo } from "./tipos";

export interface DatosProfesor {
  /** Correo del profesor con sesión iniciada. */
  correo(): string | null;
  /**
   * Alumnos con su resumen, en tiempo real. Lee un documento por alumno más su resumen
   * (no cada actividad), y después solo lo que cambia.
   */
  escucharAlumnos(alCambiar: (alumnos: AlumnoFila[]) => void, alError: (e: Error) => void): () => void;
  escucharGrupos(alCambiar: (grupos: Grupo[]) => void, alError: (e: Error) => void): () => void;
  /** Una actividad de un alumno (código, historial, nota), en tiempo real. */
  escucharActividad(alumnoId: string, actividadId: string, alCambiar: (a: Actividad | null) => void, alError: (e: Error) => void): () => void;
  crearAlumno(nuevo: NuevoAlumno): Promise<Credenciales>;
  restablecerAlumno(alumnoId: string): Promise<Credenciales>;
  actualizarAlumno(alumnoId: string, cambios: { nombre?: string; grupo?: string | null }): Promise<void>;
  eliminarAlumno(alumnoId: string): Promise<void>;
  guardarGrupo(grupoId: string | null, datos: Partial<DocGrupo> & { nombre: string }): Promise<string>;
  eliminarGrupo(grupoId: string): Promise<void>;
  calificar(alumnoId: string, actividadId: string, nota: Omit<NotaProfesor, "actualizado"> | null): Promise<void>;
}

let instancia: DatosProfesor | null = null;

export function configurarDatos(d: DatosProfesor) {
  instancia = d;
}

export function datos(): DatosProfesor {
  if (!instancia) throw new Error("El área del profesor no está configurada.");
  return instancia;
}
