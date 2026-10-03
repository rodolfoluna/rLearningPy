// Tipos que comparten la interfaz del alumno y su núcleo (Firebase o simulado).

export interface PerfilPublico {
  /** ID estable del alumno (alumnos/{alumnoId}). */
  perfil_id: string;
  numero_control: string;
  nombre: string;
  creado: number;
}

export interface Politicas {
  pegado: "bloquear" | "propio";
  registrar_salidas: boolean;
}

export interface GrupoInfo {
  grupo_id: string;
  nombre: string;
  politicas: Politicas;
}

export interface EstadoApp {
  version: string;
  plataforma: string;
  dev: boolean;
  /** ¿Ya hay un profesor configurado? (null: no se pudo saber sin conexión). */
  hay_profesor: boolean | null;
  autoprueba?: string | null;
}

export interface EstadoActividad {
  codigo: string;
  completada: boolean;
  pasadas: number;
  total: number;
  puntos: number;
  intentos: number;
  respuesta: string | null;
  pistas: number;
  actualizado: number;
  /** Calificación o comentario del profesor (lo escribe la app del profesor). */
  nota?: NotaActividad | null;
}

export interface NotaActividad {
  calificacion: number | null;
  comentario: string;
  actualizado: number;
}

export interface Contadores {
  tiempo_ms: number;
  ejecuciones: number;
  errores: number;
  pruebas: number;
  pruebas_exitosas: number;
  copias: number;
  pegados_intentos: number;
  pegados_permitidos: number;
  inserciones_sospechosas: number;
  salidas: number;
  tiempo_fuera_ms: number;
  pistas: number;
  teclas: number;
  ejecutables: number;
}

export interface Estadisticas {
  global: Contadores;
  por_actividad: Record<string, Contadores>;
}

export interface EstadoAlumno {
  perfil: PerfilPublico;
  grupo: GrupoInfo | null;
  actividades: Record<string, EstadoActividad>;
  estadisticas: Estadisticas;
  /** Primer acceso (o contraseña restablecida): debe elegir una contraseña nueva antes de seguir. */
  debe_cambiar_clave: boolean;
}

export interface ResultadoGuardado {
  ok: boolean;
  codigo: string;
}

/** Resultado del login de la pantalla común. */
export type SesionIniciada = { rol: "alumno"; estado: EstadoAlumno } | { rol: "profesor" };

/** Estado de la sincronización con la nube (indicador en la barra). */
export type EstadoSincronizacion = "sin-conexion" | "sincronizando" | "sincronizado";

export function contadoresVacios(): Contadores {
  return {
    tiempo_ms: 0,
    ejecuciones: 0,
    errores: 0,
    pruebas: 0,
    pruebas_exitosas: 0,
    copias: 0,
    pegados_intentos: 0,
    pegados_permitidos: 0,
    inserciones_sospechosas: 0,
    salidas: 0,
    tiempo_fuera_ms: 0,
    pistas: 0,
    teclas: 0,
    ejecutables: 0,
  };
}
