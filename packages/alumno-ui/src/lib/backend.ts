// Acceso al núcleo. La cáscara elige el suyo al arrancar (`iniciarApp`): Firebase en la versión
// web o una simulación en memoria para desarrollar y probar la interfaz.
//
// Regla para los núcleos: ninguna operación del alumno espera la confirmación del servidor; todo
// se guarda primero en este equipo y se sincroniza solo (sin conexión la app sigue igual).

import type { LoteOperaciones } from "@rlp/editor";
import type {
  EstadoActividad,
  EstadoAlumno,
  EstadoApp,
  EstadoSincronizacion,
  Estadisticas,
  ResultadoGuardado,
  SesionIniciada,
} from "./tipos";

export interface Backend {
  estadoApp(): Promise<EstadoApp>;
  /** Sesión guardada en este navegador, si la hay (funciona sin conexión). */
  reanudarSesion(): Promise<SesionIniciada | null>;
  /** Login común: número de control (alumno) o correo (profesor). Necesita conexión. */
  iniciarSesion(usuario: string, contrasena: string): Promise<SesionIniciada>;
  /** Configuración inicial: crea la cuenta del único profesor. Solo si aún no hay profesor. */
  configurarProfesor(correo: string, contrasena: string): Promise<void>;
  /** Primer acceso del alumno: contraseña nueva obligatoria (quita `debe_cambiar_clave`). */
  cambiarContrasenaInicial(nueva: string): Promise<void>;
  cambiarContrasena(actual: string, nueva: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  estado(): Promise<EstadoAlumno>;
  estadisticas(): Promise<Estadisticas>;
  abrirActividad(id: string, codigoInicial: string): Promise<EstadoActividad>;
  guardarEdicion(id: string, lote: LoteOperaciones, texto: string): Promise<ResultadoGuardado>;
  reiniciarActividad(id: string, codigoInicial: string): Promise<EstadoActividad>;
  registrarPruebas(id: string, pasadas: number, total: number, puntos: number): Promise<EstadoActividad>;
  registrarRespuesta(id: string, respuesta: string, correcta: boolean, puntos: number): Promise<EstadoActividad>;
  registrarPista(id: string, numero: number): Promise<EstadoActividad>;
  registrarEvento(tipo: string, actividad: string | null, datos: Record<string, unknown>): Promise<void>;
  /** Pasa a la cola de sincronización lo que se está agrupando (antes de cerrar o recargar). */
  vaciar(): Promise<void>;
  /** Avisa los cambios del estado de sincronización; devuelve la función para dejar de escuchar. */
  alSincronizar(fn: (estado: EstadoSincronizacion) => void): () => void;
  /** Avisa cuando llegan cambios de otro equipo o del profesor (actividades, grupo). */
  alCambiarAlumno(fn: (estado: EstadoAlumno) => void): () => void;
}

let proveedor: (() => Promise<Backend>) | null = null;
let instancia: Promise<Backend> | null = null;

export function configurarBackend(crear: () => Promise<Backend>) {
  proveedor = crear;
  instancia = null;
}

export function backend(): Promise<Backend> {
  if (!instancia) {
    if (!proveedor) return Promise.reject(new Error("La app no configuró su núcleo (iniciarApp)."));
    instancia = proveedor();
  }
  return instancia;
}
