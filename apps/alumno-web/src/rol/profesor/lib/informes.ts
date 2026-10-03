// Archivos que genera el profesor: avance (CSV), credenciales (CSV y hoja para imprimir).

import type { Credenciales } from "@rlp/nube";
import { aCsv, type Celda } from "./csv";
import { nivelAlerta } from "./nivel";
import type { AlumnoFila, Grupo } from "./tipos";

export interface ActividadInfo {
  id: string;
  titulo: string;
  puntos: number;
}

const fechaIso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) : "");

export function completadas(a: AlumnoFila): number {
  return Object.values(a.avance).filter((x) => x.completada).length;
}

export function puntos(a: AlumnoFila): number {
  return Object.values(a.avance).reduce((s, x) => s + (x.completada ? x.puntos : 0), 0);
}

function nombreGrupo(grupos: Grupo[], id: string | null): string {
  return id ? (grupos.find((g) => g.id === id)?.nombre ?? id) : "";
}

/**
 * Avance resumido: una fila por alumno y una columna por actividad con los puntos obtenidos
 * (vacía si no la ha abierto; 0 si la intentó sin completarla).
 */
export function csvAvance(alumnos: AlumnoFila[], grupos: Grupo[], actividades: ActividadInfo[]): string {
  const total = actividades.length;
  const filas: Celda[][] = [
    [
      "Número de control",
      "Nombre",
      "Grupo",
      "Completadas",
      "Total de actividades",
      "Avance (%)",
      "Puntos",
      "Alerta",
      "Intentos de pegar",
      "Inserciones sospechosas",
      "Minutos de práctica",
      "Última sincronización",
      ...actividades.map((a) => a.id),
    ],
  ];
  for (const a of alumnos) {
    const c = completadas(a);
    filas.push([
      a.control,
      a.nombre,
      nombreGrupo(grupos, a.grupo),
      c,
      total,
      total ? Math.round((c / total) * 100) : 0,
      puntos(a),
      nivelAlerta(a.global).nivel,
      a.global.pegados_intentos,
      a.global.inserciones_sospechosas,
      Math.round(a.global.tiempo_ms / 60_000),
      fechaIso(a.ultimaSync),
      ...actividades.map((act) => {
        const x = a.avance[act.id];
        return x ? (x.completada ? x.puntos : 0) : "";
      }),
    ]);
  }
  return aCsv(filas);
}

/** Detalle: una fila por alumno × actividad (solo las que abrió o calificaste). */
export function csvDetalle(alumnos: AlumnoFila[], grupos: Grupo[], actividades: ActividadInfo[]): string {
  const filas: Celda[][] = [
    [
      "Número de control",
      "Nombre",
      "Grupo",
      "Actividad",
      "Título",
      "Completada",
      "Pruebas pasadas",
      "Pruebas",
      "Puntos",
      "Puntos posibles",
      "Intentos",
      "Minutos",
      "Intentos de pegar",
      "Calificación",
      "Comentario",
      "Actualizado",
    ],
  ];
  for (const a of alumnos) {
    for (const act of actividades) {
      const x = a.avance[act.id];
      const nota = a.notas[act.id];
      if (!x && !nota) continue;
      const c = a.porActividad[act.id];
      filas.push([
        a.control,
        a.nombre,
        nombreGrupo(grupos, a.grupo),
        act.id,
        act.titulo,
        x?.completada ? "sí" : "no",
        x?.pasadas ?? "",
        x?.total ?? "",
        x?.completada ? x.puntos : 0,
        act.puntos,
        x?.intentos ?? 0,
        c ? Math.round(c.tiempo_ms / 60_000) : 0,
        c?.pegados_intentos ?? 0,
        nota?.calificacion ?? "",
        nota?.comentario ?? "",
        fechaIso(x?.actualizado),
      ]);
    }
  }
  return aCsv(filas);
}

export function csvCredenciales(cred: Credenciales[], grupo: string): string {
  return aCsv([
    ["Número de control", "Nombre", "Grupo", "Contraseña temporal"],
    ...cred.map((c) => [c.control, c.nombre, grupo, c.clave]),
  ]);
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Hoja imprimible con una tarjeta recortable por alumno. */
export function htmlCredenciales(cred: Credenciales[], grupo: string, direccion: string): string {
  const tarjetas = cred
    .map(
      (c) => `<div class="t">
  <div class="n">${escapar(c.nombre)}</div>
  <div class="g">${escapar(grupo)}</div>
  <div><span>Número de control:</span> <b>${escapar(c.control)}</b></div>
  <div><span>Contraseña temporal:</span> <b class="c">${escapar(c.clave)}</b></div>
  <div class="p">Entra en <b>${escapar(direccion)}</b>. La primera vez te pedirá elegir una contraseña nueva.</div>
</div>`,
    )
    .join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Credenciales ${escapar(grupo)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; margin: 0; color: #111; }
  .rejilla { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .t { border: 1px dashed #777; border-radius: 3mm; padding: 4mm 5mm; break-inside: avoid; font-size: 11pt; line-height: 1.5; }
  .n { font-weight: 700; font-size: 13pt; }
  .g { color: #555; font-size: 10pt; margin-bottom: 1mm; }
  span { color: #444; }
  .c { font-family: ui-monospace, Consolas, monospace; font-size: 13pt; letter-spacing: .04em; }
  .p { margin-top: 2mm; font-size: 9pt; color: #333; }
</style></head><body><div class="rejilla">${tarjetas}</div></body></html>`;
}

/** Imprime un HTML en un marco oculto (sin ventanas emergentes). */
export function imprimirHtml(html: string) {
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  marco.srcdoc = html;
  marco.onload = () => {
    marco.contentWindow?.focus();
    marco.contentWindow?.print();
    setTimeout(() => marco.remove(), 60_000);
  };
  document.body.append(marco);
}
