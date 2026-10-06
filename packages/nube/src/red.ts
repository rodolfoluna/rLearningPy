// Tipo de red y política de sincronización (sin Firebase: lo usan también la interfaz y el
// service worker repite la misma regla).
//
// - `navigator.connection.type` solo existe en Chrome para Android (y ChromeOS): ahí distingue
//   Wi‑Fi de datos móviles. En iPhone/Safari, Firefox y Chrome de escritorio el tipo es
//   "desconocida" y se trata como Wi‑Fi (las computadoras del laboratorio no cambian).
// - El "Ahorro de datos" de Android (`saveData`) cuenta como datos móviles aunque diga Wi‑Fi.
// - Para probar sin celular: `simularRed("celular")` (el núcleo simulado lo hace con `?red=`).

export type TipoRed = "wifi" | "celular" | "desconocida";

/**
 * Ajuste del alumno (por dispositivo):
 *  - "wifi": automática en Wi‑Fi (o red desconocida), preguntar con datos móviles (predeterminado);
 *  - "siempre": automática siempre (como antes);
 *  - "manual": solo cuando el alumno lo pida.
 */
export type AjusteSync = "wifi" | "siempre" | "manual";

/** Estado del indicador de sincronización. */
export type EstadoSync =
  | "sin-conexion"
  | "sincronizando"
  | "sincronizado"
  /** Red de la nube en pausa (datos móviles o "solo cuando yo lo pida") y hay avances sin enviar. */
  | "pendiente-datos"
  /** Enviando lo pendiente porque el alumno tocó "Enviar ahora". */
  | "enviando-datos"
  /** Red de la nube en pausa, sin nada pendiente. */
  | "en-pausa";

/** Lo que la interfaz necesita saber además del estado. */
export interface InfoRed {
  tipo: TipoRed;
  ajuste: AjusteSync;
  /** Desde cuándo hay avances sin enviar por la pausa (ms) o null. */
  pendientesDesde: number | null;
}

interface ConexionRed extends EventTarget {
  type?: string;
  saveData?: boolean;
}

let simulada: TipoRed | null = null;
const oyentesSimulados = new Set<() => void>();

function conexion(): ConexionRed | undefined {
  return (globalThis.navigator as (Navigator & { connection?: ConexionRed }) | undefined)?.connection;
}

/** Traduce `navigator.connection` (o algo con la misma forma) al tipo de red. */
export function clasificarRed(c: { type?: string; saveData?: boolean } | undefined | null): TipoRed {
  if (!c) return "desconocida";
  if (c.saveData) return "celular";
  switch (c.type) {
    case "cellular":
      return "celular";
    case "wifi":
    case "ethernet":
    case "wimax":
      return "wifi";
    default:
      return "desconocida";
  }
}

export function tipoRed(): TipoRed {
  return simulada ?? clasificarRed(conexion());
}

/** Avisa cada cambio de red (evento `change` de `navigator.connection`). Devuelve cómo dejar de escuchar. */
export function alCambiarRed(cb: (tipo: TipoRed) => void): () => void {
  let anterior = tipoRed();
  const aviso = () => {
    const t = tipoRed();
    if (t === anterior) return;
    anterior = t;
    cb(t);
  };
  const c = conexion();
  c?.addEventListener?.("change", aviso);
  oyentesSimulados.add(aviso);
  return () => {
    c?.removeEventListener?.("change", aviso);
    oyentesSimulados.delete(aviso);
  };
}

/** Fija el tipo de red (pruebas y núcleo simulado); `null` vuelve a la red real. */
export function simularRed(t: TipoRed | null) {
  simulada = t;
  oyentesSimulados.forEach((f) => f());
}

/** ¿Se sincroniza sola o se espera a que el alumno lo pida? */
export function decidirSync(ajuste: AjusteSync, tipo: TipoRed): "auto" | "preguntar" {
  if (ajuste === "siempre") return "auto";
  if (ajuste === "manual") return "preguntar";
  return tipo === "celular" ? "preguntar" : "auto";
}

/** Estado del indicador a partir de los datos del núcleo. */
export function calcularEstadoSync(d: {
  enLinea: boolean;
  /** ¿La red de la nube está en pausa? */
  pausada: boolean;
  /** ¿Se está enviando por "Enviar ahora"? */
  enviando: boolean;
  /** ¿Hay avances sin confirmar por el servidor (o agrupándose)? */
  pendiente: boolean;
}): EstadoSync {
  if (!d.enLinea) return "sin-conexion";
  if (d.enviando) return "enviando-datos";
  if (d.pausada) return d.pendiente ? "pendiente-datos" : "en-pausa";
  return d.pendiente ? "sincronizando" : "sincronizado";
}

// ------------------------------------------------------------ ajustes guardados en el dispositivo

const CLAVE_AJUSTE = "rlp-sync";

export function leerAjusteSync(): AjusteSync {
  try {
    const v = localStorage.getItem(CLAVE_AJUSTE);
    if (v === "wifi" || v === "siempre" || v === "manual") return v;
  } catch {
    /* sin almacenamiento */
  }
  return "wifi";
}

export function guardarAjusteSync(a: AjusteSync) {
  try {
    localStorage.setItem(CLAVE_AJUSTE, a);
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
}

/** Clave (en localStorage) de la fecha de los avances pendientes más antiguos de un alumno. */
export const clavePendientes = (alumnoId: string) => `rlp-pendientes-desde:${alumnoId}`;

export function leerNumero(clave: string): number | null {
  try {
    const n = Number(localStorage.getItem(clave));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function guardarNumero(clave: string, n: number | null) {
  try {
    if (n === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, String(n));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Le dice al service worker qué red ve la página (el service worker no siempre puede saberlo: fuera
 * de Chrome para Android no tiene `connection.type`). Va en una caché propia, que el service worker
 * lee antes de descargar una versión nueva.
 */
export const CACHE_RED = "rlp-red";
export async function avisarRedAlServiceWorker(t: TipoRed = tipoRed()) {
  try {
    if (!("caches" in globalThis)) return;
    const c = await caches.open(CACHE_RED);
    await c.put("tipo", new Response(JSON.stringify({ tipo: t, fecha: Date.now() })));
  } catch {
    /* sin Cache Storage */
  }
}
