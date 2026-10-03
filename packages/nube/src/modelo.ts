// Modelo de datos en Firestore, compartido por la app del alumno y la del profesor.
//
//   config/app                                   ConfigApp       (un solo profesor)
//   alumnos/{alumnoId}                           DocAlumno
//   alumnos/{alumnoId}/actividades/{actividadId} DocActividad
//   alumnos/{alumnoId}/resumen/contadores        DocContadores
//   usuarios/{uid}                               DocUsuario      (uid de Auth → alumnoId estable)
//   grupos/{grupoId}                             DocGrupo
//   logins/{control}                             DocLogin        (público: correo vigente del alumno)
//
// Los tiempos son milisegundos desde epoch (Date.now()), no Timestamps de Firestore: así se
// escriben igual sin conexión y se comparan sin conversiones.
// No hay dependencias de Firebase aquí: este módulo se usa también en pruebas y en Node.

/** config/app: quién es el profesor. Se crea una sola vez y `profesorUid` ya no cambia. */
export interface ConfigApp {
  profesorUid: string;
  /** Correo del profesor (informativo). */
  correo?: string;
  creado: number;
}

/** Política de pegado del editor: "bloquear" (por defecto) o "propio" (solo lo copiado dentro de la app). */
export type PoliticaPegadoGrupo = "bloquear" | "propio";

export interface PoliticasGrupo {
  pegado: PoliticaPegadoGrupo;
  /** Contar las salidas de la ventana (por defecto sí). */
  registrarSalidas?: boolean;
}

/** grupos/{grupoId} */
export interface DocGrupo {
  nombre: string;
  politicas: PoliticasGrupo;
  materia?: string;
  periodo?: string;
  creado?: number;
}

/** alumnos/{alumnoId}. El alumno solo puede cambiar `debeCambiarClave` (a false) y `ultimaSync`. */
export interface DocAlumno {
  nombre: string;
  control: string;
  /** ID del grupo (grupos/{grupo}) o null. */
  grupo: string | null;
  /** uid de la cuenta de Auth vigente. */
  uidActual: string;
  /** Correo de acceso vigente (`correoAlumno(control, n)`). */
  correo: string;
  /** Correos anteriores (cada "restablecer" crea una cuenta nueva `<control>+r{n}@…`). */
  alias: string[];
  debeCambiarClave: boolean;
  creado: number;
  /** Última vez que la app del alumno estuvo en línea con todo enviado (ms) o null. */
  ultimaSync: number | null;
}

/** alumnos/{alumnoId}/actividades/{actividadId} */
export interface DocActividad {
  codigo: string;
  completada: boolean;
  pasadas: number;
  total: number;
  /** Puntos obtenidos: se fijan al completarla la primera vez y no se quitan. */
  puntos: number;
  intentos: number;
  respuesta: string | null;
  /** Número de la última pista vista (máximo). */
  pistas: number;
  actualizado: number;
  /** Calificación/comentario del profesor (solo lo escribe el profesor). */
  nota?: NotaProfesor | null;
  /**
   * Historial de edición para la reproducción. Cada elemento es un `LoteEdiciones` en JSON
   * (Firestore no admite arreglos anidados). Se agrega con `arrayUnion`, en lotes de ~10 s.
   */
  ediciones?: string[];
  /** Se dejó de guardar el historial porque el documento se acercaba a 1 MB. */
  edicionesTruncadas?: boolean;
}

/** Calificación y comentario del profesor para una actividad. */
export interface NotaProfesor {
  calificacion: number | null;
  comentario: string;
  actualizado: number;
}

/**
 * Resumen de una actividad dentro de `resumen/contadores.avance`: lo que necesita el tablero del
 * profesor sin leer cada documento de actividad (cuota de lecturas del plan Spark).
 */
export interface ResumenAvance {
  completada: boolean;
  puntos: number;
  pasadas: number;
  total: number;
  intentos: number;
  actualizado: number;
}

/** Elemento (en JSON) de `DocActividad.ediciones`: el `LoteOperaciones` del editor. */
export interface LoteEdiciones {
  /** Epoch ms de referencia; cada operación guarda su desfase. */
  t0: number;
  /** Operaciones `[dt, desde, hasta, insertado, origen]` (ver @rlp/editor). */
  ops: [number, number, number, string, string][];
  /** Texto antes de aplicar las operaciones, solo en el primer lote y tras reiniciar. */
  base?: string;
}

/** Contadores antitrampa y de actividad (mismos nombres que la interfaz del alumno). */
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

/**
 * alumnos/{alumnoId}/resumen/contadores. Se escribe con `increment()` (sumas desde varios
 * equipos no se pisan), agrupando los cambios cada pocos segundos.
 */
export interface DocContadores {
  global: Contadores;
  por_actividad: Record<string, Contadores>;
  actualizado: number;
  /** Resumen por actividad (lo escribe la app del alumno junto con los contadores). */
  avance?: Record<string, ResumenAvance>;
  /** Copia de las notas del profesor (para el tablero y el CSV; solo la escribe el profesor). */
  notas?: Record<string, NotaProfesor>;
}

/** usuarios/{uid} */
export interface DocUsuario {
  alumnoId: string;
}

/** logins/{control}: legible sin sesión (para traducir el número de control al correo vigente). */
export interface DocLogin {
  correo: string;
}

export const POLITICAS_POR_DEFECTO: PoliticasGrupo = { pegado: "bloquear", registrarSalidas: true };

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

/** Rutas de los documentos y colecciones. */
export const rutas = {
  config: () => "config/app",
  alumnos: () => "alumnos",
  alumno: (alumnoId: string) => `alumnos/${alumnoId}`,
  actividades: (alumnoId: string) => `alumnos/${alumnoId}/actividades`,
  actividad: (alumnoId: string, actividadId: string) => `alumnos/${alumnoId}/actividades/${actividadId}`,
  contadores: (alumnoId: string) => `alumnos/${alumnoId}/resumen/contadores`,
  usuario: (uid: string) => `usuarios/${uid}`,
  grupos: () => "grupos",
  grupo: (grupoId: string) => `grupos/${grupoId}`,
  login: (control: string) => `logins/${normalizarControl(control)}`,
} as const;

/** Nombre de las subcolecciones de actividades (para `collectionGroup`). */
export const COLECCION_ACTIVIDADES = "actividades";
/** Subcolección del resumen de cada alumno (`collectionGroup("resumen")` en el tablero). */
export const COLECCION_RESUMEN = "resumen";

/** Resumen de avance de una actividad (para `DocContadores.avance`). */
export function resumenAvance(a: Partial<DocActividad>): ResumenAvance {
  return {
    completada: !!a.completada,
    puntos: a.puntos ?? 0,
    pasadas: a.pasadas ?? 0,
    total: a.total ?? 0,
    intentos: a.intentos ?? 0,
    actualizado: a.actualizado ?? 0,
  };
}

export const DOMINIO_ALUMNOS = "alumnos.rlp.local";

/** Número de control en minúsculas y sin espacios. Lanza un error si tiene caracteres no válidos. */
export function normalizarControl(control: string): string {
  const c = control.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(c)) {
    throw new Error("El número de control solo puede tener letras, números, guiones y guiones bajos.");
  }
  return c;
}

/**
 * Correo sintético de la cuenta de Auth de un alumno: `<control>@alumnos.rlp.local` o, tras
 * restablecerla `n` veces, `<control>+r{n}@alumnos.rlp.local`.
 */
export function correoAlumno(control: string, n = 0): string {
  const c = normalizarControl(control);
  return n > 0 ? `${c}+r${n}@${DOMINIO_ALUMNOS}` : `${c}@${DOMINIO_ALUMNOS}`;
}

const PALABRAS = [
  "gato", "perro", "luna", "sol", "mar", "rio", "nube", "arbol", "flor", "casa", "libro", "mesa",
  "silla", "lapiz", "raton", "tigre", "leon", "oso", "lobo", "pato", "rana", "pez", "ballena",
  "delfin", "tortuga", "conejo", "caballo", "vaca", "cabra", "oveja", "mango", "pera", "uva",
  "fresa", "limon", "naranja", "coco", "mapa", "barco", "tren", "avion", "cohete", "planeta",
  "estrella", "cometa", "volcan", "monte", "playa", "bosque", "selva", "isla", "puente", "torre",
  "faro", "reloj", "llave", "campana", "tambor", "guitarra", "piano", "flauta", "papel", "tinta",
  "jardin", "cielo", "lluvia", "viento", "trueno", "nieve", "fuego", "piedra", "arena", "hoja",
  "rama", "semilla", "abeja", "hormiga", "buho", "aguila", "colibri", "zorro", "ardilla", "koala",
];

function aleatorio(n: number): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % n;
}

/** Contraseña temporal legible, p. ej. `gato-4821` o `sol-luna-0937` (siempre ≥ 8 caracteres). */
export function generarContrasena(): string {
  let palabra = PALABRAS[aleatorio(PALABRAS.length)];
  if (palabra.length < 4) palabra += `-${PALABRAS[aleatorio(PALABRAS.length)]}`;
  const numero = String(aleatorio(10_000)).padStart(4, "0");
  return `${palabra}-${numero}`;
}
