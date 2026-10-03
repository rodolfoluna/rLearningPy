// CSV: exportar (avance, credenciales) e importar listas de alumnos ("control,nombre").

export type Celda = string | number | boolean | null | undefined;

function celda(v: Celda): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r;]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Texto CSV (con BOM para que Excel lo abra en UTF-8). */
export function aCsv(filas: Celda[][]): string {
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}

/** Separa una línea CSV respetando comillas. Detecta "," ";" o tabulador. */
export function separarLinea(linea: string, sep?: string): string[] {
  const s = sep ?? (linea.includes("\t") ? "\t" : linea.includes(";") && !linea.includes(",") ? ";" : ",");
  const campos: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') comillas = false;
      else actual += c;
    } else if (c === '"') comillas = true;
    else if (c === s) {
      campos.push(actual);
      actual = "";
    } else actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

export interface FilaAlumno {
  control: string;
  nombre: string;
  /** Línea del texto original (para los mensajes de error). */
  linea: number;
}

/**
 * Lee una lista de alumnos pegada o de un archivo CSV: una línea por alumno con
 * `control,nombre` (también `;` o tabulador). Omite líneas vacías y un encabezado.
 */
export function leerListaAlumnos(texto: string): { filas: FilaAlumno[]; errores: string[] } {
  const filas: FilaAlumno[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .forEach((linea, i) => {
      if (!linea.trim()) return;
      const [control = "", ...resto] = separarLinea(linea);
      const nombre = resto.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (i === 0 && /control|matr[ií]cula|n[uú]mero/i.test(control)) return; // encabezado
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(control)) {
        errores.push(`Línea ${i + 1}: número de control no válido («${control}»).`);
        return;
      }
      if (nombre.length < 3) {
        errores.push(`Línea ${i + 1}: falta el nombre de ${control}.`);
        return;
      }
      const clave = control.toLowerCase();
      if (vistos.has(clave)) {
        errores.push(`Línea ${i + 1}: ${control} está repetido.`);
        return;
      }
      vistos.add(clave);
      filas.push({ control, nombre, linea: i + 1 });
    });
  return { filas, errores };
}

/** Descarga un texto como archivo. */
export function descargar(nombre: string, contenido: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Fecha corta para nombres de archivo: 2026-10-02. */
export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
