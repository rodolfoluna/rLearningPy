// "Crear programa .exe" sin servidor: el navegador descarga una vez el lanzador de Windows
// (lanzador/, en Rust, con Python embebido), le pega al final el programa del alumno y entrega el
// resultado como <nombre>.exe. El formato del final del archivo ("remolque") es el que lee
// lanzador/src/remolque.rs:
//
//   [lanzador .exe] [nombre UTF-8][len u32 LE]["RLPNOMBR"] [script UTF-8][len u32 LE]["RLPSCRPT"]

export const MAGIA_SCRIPT = "RLPSCRPT";
export const MAGIA_NOMBRE = "RLPNOMBR";

/** Caché propia del lanzador (no forma parte de la precarga del service worker: pesa ~12 MB). */
export const CACHE_LANZADOR = "rlp-lanzador";
/** Rutas relativas a la página. */
export const RUTA_LANZADOR = "lanzador/rlp-lanzador.exe";
export const RUTA_INFO = "lanzador/lanzador.json";

const codificador = new TextEncoder();

function bloque(datos: Uint8Array, magia: string): Uint8Array {
  const r = new Uint8Array(datos.length + 12);
  r.set(datos, 0);
  new DataView(r.buffer).setUint32(datos.length, datos.length, true);
  r.set(codificador.encode(magia), datos.length + 4);
  return r;
}

/** Bytes que se pegan al final del lanzador. */
export function armarRemolque(script: string, nombre?: string): Uint8Array {
  const partes = [...(nombre ? [bloque(codificador.encode(nombre), MAGIA_NOMBRE)] : []), bloque(codificador.encode(script), MAGIA_SCRIPT)];
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    r.set(p, i);
    i += p.length;
  }
  return r;
}

/** Lee el remolque al final de un .exe (para pruebas y diagnóstico). */
export function leerRemolque(exe: Uint8Array): { nombre?: string; script: string } | null {
  const decodificador = new TextDecoder("utf-8", { fatal: true });
  const leerBloque = (fin: number, magia: string) => {
    if (fin < 12) return null;
    if (new TextDecoder().decode(exe.subarray(fin - 8, fin)) !== magia) return null;
    const largo = new DataView(exe.buffer, exe.byteOffset).getUint32(fin - 12, true);
    if (largo > fin - 12) return null;
    const inicio = fin - 12 - largo;
    try {
      return { texto: decodificador.decode(exe.subarray(inicio, fin - 12)), inicio };
    } catch {
      return null;
    }
  };
  const s = leerBloque(exe.length, MAGIA_SCRIPT);
  if (!s) return null;
  const n = leerBloque(s.inicio, MAGIA_NOMBRE);
  return n ? { nombre: n.texto, script: s.texto } : { script: s.texto };
}

const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** Nombre de archivo válido en Windows (sin la extensión .exe). */
export function limpiarNombre(nombre: string): string {
  let n = nombre
    .normalize("NFC")
    .trim()
    .replace(/\.exe$/i, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  n = [...n].slice(0, 60).join("").trim();
  if (!n) return "programa";
  return RESERVADOS.test(n) ? `${n}_` : n;
}

/** Sugerencia de nombre a partir del id de la actividad ("u2-calculadora" → "calculadora"). */
export function nombreSugerido(idActividad: string): string {
  return limpiarNombre(idActividad.replace(/^u\d+-/, "").replace(/-/g, "_"));
}

export interface InfoLanzador {
  version: string;
  python: string;
  tamano: number;
  sha256: string;
}

async function sha256(datos: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", datos));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Descarga con avance (0 a 1). */
async function descargar(url: string, tamano: number, alAvance: (fraccion: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok || !r.body) throw new Error(`No se pudo descargar el lanzador (${r.status}).`);
  const total = Number(r.headers.get("content-length")) || tamano;
  const lector = r.body.getReader();
  const trozos: Uint8Array[] = [];
  let recibido = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    recibido += value.length;
    if (total) alAvance(Math.min(1, recibido / total));
  }
  const r2 = new Uint8Array(recibido);
  let i = 0;
  for (const t of trozos) {
    r2.set(t, i);
    i += t.length;
  }
  return r2.buffer;
}

/**
 * Devuelve el lanzador: de la caché "rlp-lanzador" si está al día (o si no hay conexión), o
 * descargándolo (con avance) y guardándolo para la próxima vez y para usarlo sin conexión.
 */
export async function obtenerLanzador(alAvance: (fraccion: number) => void = () => {}): Promise<ArrayBuffer> {
  const urlExe = new URL(RUTA_LANZADOR, document.baseURI).href;
  const urlInfo = new URL(RUTA_INFO, document.baseURI).href;
  const cache = "caches" in globalThis ? await caches.open(CACHE_LANZADOR).catch(() => null) : null;
  const guardado = await cache?.match(urlExe).catch(() => undefined);

  let info: InfoLanzador | null = null;
  try {
    const r = await fetch(urlInfo, { cache: "no-store" });
    if (r.ok) info = (await r.json()) as InfoLanzador;
  } catch {
    /* sin conexión */
  }

  if (guardado && (!info || guardado.headers.get("x-rlp-sha256") === info.sha256)) {
    return guardado.arrayBuffer();
  }
  if (!info) {
    throw new Error(
      navigator.onLine
        ? "El lanzador de programas no está disponible en este sitio (ver docs/INSTALACION.md)."
        : "Necesitas conexión a internet la primera vez para crear un .exe.",
    );
  }
  const datos = await descargar(urlExe, info.tamano, alAvance);
  if (crypto.subtle && (await sha256(datos)) !== info.sha256) {
    throw new Error("El lanzador descargado está dañado. Intenta de nuevo.");
  }
  await cache
    ?.put(urlExe, new Response(datos, { headers: { "content-type": "application/octet-stream", "x-rlp-sha256": info.sha256 } }))
    .catch(() => undefined); // sin espacio: funciona igual, solo que sin caché
  return datos;
}

/** Une el lanzador y el programa. */
export function crearEjecutable(lanzador: ArrayBuffer, script: string, nombre: string): Blob {
  return new Blob([lanzador, armarRemolque(script, nombre) as BlobPart], { type: "application/vnd.microsoft.portable-executable" });
}

/** Hace que el navegador descargue el blob como archivo. */
export function guardarArchivo(blob: Blob, archivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
