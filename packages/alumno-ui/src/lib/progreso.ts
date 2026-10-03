// Reglas del progreso del alumno (antes en crates/rlp-core/src/alumno.rs), como funciones puras.
// Los núcleos (Firebase y simulado) las usan para calcular el estado nuevo de cada actividad;
// no mutan sus argumentos.

import { aplicarOperaciones, type Operacion } from "@rlp/editor";
import { contadoresVacios, type Contadores, type EstadoActividad, type ResultadoGuardado } from "./tipos";

export function estadoVacio(codigo = "", ahora = Date.now()): EstadoActividad {
  return {
    codigo,
    completada: false,
    pasadas: 0,
    total: 0,
    puntos: 0,
    intentos: 0,
    respuesta: null,
    pistas: 0,
    actualizado: ahora,
  };
}

/** Al abrir una actividad: si no tiene estado, empieza con el código inicial; si no, se conserva. */
export function abrirActividad(previo: EstadoActividad | undefined, codigoInicial: string, ahora = Date.now()): EstadoActividad {
  return previo ? { ...previo } : estadoVacio(codigoInicial, ahora);
}

/** Vuelve al código inicial; conserva completada, puntos, intentos y pistas. */
export function reiniciarActividad(e: EstadoActividad | undefined, codigoInicial: string, ahora = Date.now()): EstadoActividad {
  return { ...(e ?? estadoVacio(codigoInicial, ahora)), codigo: codigoInicial, actualizado: ahora };
}

/**
 * Aplica un lote de operaciones del editor al código guardado. `ok` es falso si el resultado no
 * coincide con el texto del editor (o las operaciones no aplican): el editor adopta `codigo`.
 */
export function guardarEdicion(
  e: EstadoActividad,
  ops: Operacion[],
  textoEditor: string,
  ahora = Date.now(),
): { estado: EstadoActividad; resultado: ResultadoGuardado } {
  let nuevo: string;
  try {
    nuevo = aplicarOperaciones(e.codigo, ops);
  } catch {
    return { estado: e, resultado: { ok: false, codigo: e.codigo } };
  }
  const estado = ops.length ? { ...e, codigo: nuevo, actualizado: ahora } : e;
  return { estado, resultado: { ok: nuevo === textoEditor, codigo: nuevo } };
}

/** Resultado de "Probar": cuenta el intento; la primera vez que pasa todo, completa y fija los puntos. */
export function registrarPruebas(
  e: EstadoActividad,
  pasadas: number,
  total: number,
  puntos: number,
  ahora = Date.now(),
): EstadoActividad {
  const n = { ...e, pasadas, total, intentos: e.intentos + 1, actualizado: ahora };
  if (total > 0 && pasadas === total && !e.completada) Object.assign(n, { completada: true, puntos });
  return n;
}

/** Respuesta de predicción u opción múltiple: cuenta el intento; si es correcta, completa (una vez). */
export function registrarRespuesta(
  e: EstadoActividad,
  respuesta: string,
  correcta: boolean,
  puntos: number,
  ahora = Date.now(),
): EstadoActividad {
  const n = { ...e, respuesta, intentos: e.intentos + 1, actualizado: ahora };
  if (correcta && !e.completada) Object.assign(n, { completada: true, puntos });
  return n;
}

/** Pista vista: se guarda la más alta. */
export function registrarPista(e: EstadoActividad, numero: number): EstadoActividad {
  return { ...e, pistas: Math.max(e.pistas, numero) };
}

/**
 * Une el estado local con uno remoto (otro equipo): el código remoto gana si es más reciente y
 * distinto; completada es un O; puntos, intentos y pistas, el máximo.
 */
export function fusionar(local: EstadoActividad | undefined, remoto: EstadoActividad): EstadoActividad {
  if (!local) return { ...remoto };
  const reemplazar = remoto.actualizado > local.actualizado && remoto.codigo !== local.codigo;
  const base = reemplazar ? remoto : local;
  return {
    ...base,
    completada: local.completada || remoto.completada,
    puntos: Math.max(local.puntos, remoto.puntos),
    intentos: Math.max(local.intentos, remoto.intentos),
    pistas: Math.max(local.pistas, remoto.pistas),
    nota: remoto.nota ?? local.nota ?? null,
  };
}

// ------------------------------------------------------------------ contadores

/** Pausa máxima entre eventos que aún cuenta como tiempo de práctica (como en Rust). */
export const PAUSA_MAXIMA_MS = 2 * 60 * 1000;

/** Suma un evento a los contadores (misma tabla que estadisticas.rs). */
export function sumarEvento(c: Contadores, tipo: string, datos: Record<string, unknown>): void {
  switch (tipo) {
    case "ejecucion":
      c.ejecuciones++;
      if (datos.estado === "error") c.errores++;
      break;
    case "prueba":
      c.pruebas++;
      if (Number(datos.total) > 0 && datos.pasadas === datos.total) c.pruebas_exitosas++;
      break;
    case "copia":
      c.copias++;
      break;
    case "pegado":
      c.pegados_intentos++;
      if (datos.permitido) c.pegados_permitidos++;
      break;
    case "insercion_sospechosa":
      c.inserciones_sospechosas++;
      break;
    case "foco":
      if (datos.estado === "perdido") c.salidas++;
      else if (typeof datos.fuera_ms === "number") c.tiempo_fuera_ms += datos.fuera_ms;
      break;
    case "pista":
      c.pistas++;
      break;
    case "ejecutable":
      c.ejecutables++;
      break;
    case "edicion":
      c.teclas += ((datos.ops as Operacion[] | undefined) ?? []).filter((o) => o[4] === "t").length;
      break;
  }
}

/**
 * Mide el tiempo de práctica entre eventos consecutivos: el intervalo se suma a la actividad del
 * evento anterior si es menor a `PAUSA_MAXIMA_MS` y el alumno no estaba fuera de la ventana.
 */
export class Cronometro {
  private anterior: { t: number; actividad: string | null; fuera: boolean } | null = null;

  /** Registra un evento; devuelve `[actividad, ms]` a sumar en `tiempo_ms`, o null. */
  evento(t: number, tipo: string, actividad: string | null, datos: Record<string, unknown>): [string, number] | null {
    const prev = this.anterior;
    this.anterior = { t, actividad, fuera: tipo === "foco" && datos.estado === "perdido" };
    if (!prev || prev.fuera || !prev.actividad || tipo === "sesion_inicio") return null;
    const dt = t - prev.t;
    return dt > 0 && dt < PAUSA_MAXIMA_MS ? [prev.actividad, dt] : null;
  }
}

/** Suma `b` a `a` campo por campo (en una copia). */
export function sumarContadores(a: Contadores, b: Partial<Contadores>): Contadores {
  const r = { ...contadoresVacios(), ...a };
  for (const [k, v] of Object.entries(b) as [keyof Contadores, number][]) r[k] = (r[k] ?? 0) + (v ?? 0);
  return r;
}
