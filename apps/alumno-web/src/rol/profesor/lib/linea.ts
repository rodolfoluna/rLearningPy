// Historial de escritura de una actividad: de los lotes guardados en Firestore
// (`DocActividad.ediciones`, cada uno un `LoteEdiciones` en JSON) a la línea de tiempo que
// reproduce el Reproductor, y el ritmo de escritura (ráfagas imposibles para una persona).

import type { LoteEdiciones } from "@rlp/nube";
import type { LineaDeTiempo, Marca, OpConTiempo, Ritmo, Tramo } from "./tipos";

const DISPOSITIVO = "web";

/** Lee los lotes (los que no se entienden se cuentan en `invalidos`). */
export function leerLotes(ediciones: string[] | undefined): { lotes: LoteEdiciones[]; invalidos: number } {
  const lotes: LoteEdiciones[] = [];
  let invalidos = 0;
  for (const texto of ediciones ?? []) {
    try {
      const l = JSON.parse(texto) as LoteEdiciones;
      if (typeof l?.t0 !== "number" || !Array.isArray(l.ops)) throw new Error();
      lotes.push(l);
    } catch {
      invalidos++;
    }
  }
  return { lotes, invalidos };
}

function aplicar(texto: string, ops: OpConTiempo[]): string {
  let t = texto;
  for (const [, desde, hasta, insertado] of ops) {
    if (desde < 0 || hasta < desde || hasta > t.length) throw new Error("operación fuera de rango");
    t = t.slice(0, desde) + insertado + t.slice(hasta);
  }
  return t;
}

/**
 * Arma la línea de tiempo. Cada lote con `base` (primer lote de una sesión o tras reiniciar)
 * empieza un tramo nuevo desde ese texto; los demás continúan el tramo anterior.
 */
export function lineaDeTiempo(
  actividad: string,
  datos: { codigo?: string; ediciones?: string[]; edicionesTruncadas?: boolean },
  codigoInicial = "",
): LineaDeTiempo {
  const avisos: string[] = [];
  const { lotes, invalidos } = leerLotes(datos.ediciones);
  if (invalidos) avisos.push(`${invalidos} lote(s) dañado(s) se omitieron`);
  if (datos.edicionesTruncadas) avisos.push("el historial se dejó de guardar al llegar al límite de tamaño");
  // Orden estable por momento de inicio (dos equipos pueden intercalar sus lotes).
  const ordenados = lotes.map((l, i) => ({ l, i })).sort((a, b) => a.l.t0 - b.l.t0 || a.i - b.i).map((x) => x.l);

  const tramos: Tramo[] = [];
  const marcas: Marca[] = [];
  let actual: Tramo | null = null;
  for (const lote of ordenados) {
    const ops: OpConTiempo[] = lote.ops.map(([dt, desde, hasta, insertado, origen]) => [lote.t0 + dt, desde, hasta, insertado, origen]);
    if (lote.base !== undefined || !actual) {
      let motivo = "continuacion";
      if (!tramos.length) motivo = "inicio";
      else if (lote.base === codigoInicial && codigoInicial !== "") motivo = "reinicio";
      if (lote.base === undefined) avisos.push("el historial no tiene el texto de partida; se usó el código inicial de la actividad");
      actual = { dispositivo: DISPOSITIVO, motivo, texto_inicial: lote.base ?? codigoInicial, ops: [], t_inicio: lote.t0, t_fin: lote.t0 };
      tramos.push(actual);
      if (motivo === "reinicio") marcas.push({ t: lote.t0, tipo: "reinicio", dispositivo: DISPOSITIVO, datos: null });
    }
    actual.ops.push(...ops);
    for (const op of ops) {
      if (op[4] === "p") marcas.push({ t: op[0], tipo: "pegado", dispositivo: DISPOSITIVO, datos: { permitido: true } });
    }
    actual.t_fin = Math.max(actual.t_fin, ops.length ? ops[ops.length - 1][0] : lote.t0);
  }
  return { actividad, tramos, marcas, codigo_final: datos.codigo ?? "", avisos };
}

/**
 * ¿El código guardado sale de lo escrito en el editor? Reconstruye el último tramo (y los
 * anteriores, para detectar operaciones que no encajan).
 */
export function verificarLinea(
  linea: LineaDeTiempo,
  codigoInicial = "",
): { reconstruye: boolean; error: string | null; texto: string } {
  let texto = codigoInicial;
  try {
    for (const tr of linea.tramos) texto = aplicar(tr.texto_inicial ?? texto, tr.ops);
  } catch (e) {
    return { reconstruye: false, error: (e as Error).message, texto };
  }
  const norm = (t: string) => t.replace(/\r\n/g, "\n").trimEnd();
  return { reconstruye: norm(texto) === norm(linea.codigo_final), error: null, texto };
}

/** Caracteres por segundo tecleados que una persona difícilmente sostiene 5 s. */
export const CPS_SOSPECHOSO = 12;

/** Métricas del ritmo de escritura (misma lógica que la versión de escritorio). */
export function ritmo(ops: OpConTiempo[]): Ritmo {
  const r: Ritmo = { tecleados: 0, automaticos: 0, deshacer_rehacer: 0, pegados: 0, otros: 0, max_cps: 0, rafagas: 0 };
  const tecleo: [number, number][] = [];
  for (const [t, , , insertado, origen] of ops) {
    const n = [...insertado].filter((c) => !/\s/.test(c)).length;
    if (origen === "t") {
      r.tecleados += n;
      if (n > 0) tecleo.push([t, n]);
    } else if (origen === "i") r.automaticos += n;
    else if (origen === "u" || origen === "r") r.deshacer_rehacer += n;
    else if (origen === "p") r.pegados += n;
    else if (origen !== "d") r.otros += n;
  }
  tecleo.sort((a, b) => a[0] - b[0]);
  const ventana = 5000;
  let inicio = 0;
  let suma = 0;
  let enRafaga = false;
  for (let fin = 0; fin < tecleo.length; fin++) {
    suma += tecleo[fin][1];
    while (tecleo[fin][0] - tecleo[inicio][0] > ventana) suma -= tecleo[inicio++][1];
    const cps = suma / (ventana / 1000);
    if (cps > r.max_cps) r.max_cps = cps;
    if (cps > CPS_SOSPECHOSO) {
      if (!enRafaga) r.rafagas++;
      enRafaga = true;
    } else enRafaga = false;
  }
  return r;
}

/** Todas las operaciones de la línea de tiempo. */
export function operaciones(linea: LineaDeTiempo): OpConTiempo[] {
  return linea.tramos.flatMap((t) => t.ops);
}
