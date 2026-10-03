import { contadoresVacios, type LoteEdiciones } from "@rlp/nube";
import { describe, expect, it } from "vitest";
import { aCsv, leerListaAlumnos, separarLinea } from "./csv";
import { filaDeAlumno } from "./datos-firebase";
import { completadas, csvAvance, csvCredenciales, csvDetalle, htmlCredenciales, puntos } from "./informes";
import { lineaDeTiempo, operaciones, ritmo, verificarLinea } from "./linea";
import { nivelAlerta } from "./nivel";

describe("nivelAlerta", () => {
  it("verde sin señales", () => {
    expect(nivelAlerta(contadoresVacios())).toEqual({ nivel: "verde", motivos: [] });
    expect(nivelAlerta(undefined).nivel).toBe("verde");
  });
  it("amarillo con algún intento de pegar o mucho tiempo fuera", () => {
    expect(nivelAlerta({ pegados_intentos: 1 }).nivel).toBe("amarillo");
    expect(nivelAlerta({ tiempo_fuera_ms: 15 * 60_000, tiempo_ms: 30 * 60_000 }).nivel).toBe("amarillo");
    // Poco tiempo fuera en proporción: no alerta.
    expect(nivelAlerta({ tiempo_fuera_ms: 15 * 60_000, tiempo_ms: 300 * 60_000 }).nivel).toBe("verde");
    expect(nivelAlerta({}, 2).nivel).toBe("amarillo");
  });
  it("rojo con inserciones sospechosas o muchos intentos de pegar", () => {
    expect(nivelAlerta({ inserciones_sospechosas: 1 }).nivel).toBe("rojo");
    const r = nivelAlerta({ pegados_intentos: 5, tiempo_fuera_ms: 20 * 60_000 });
    expect(r.nivel).toBe("rojo");
    expect(r.motivos).toHaveLength(2);
  });
});

const lote = (l: LoteEdiciones) => JSON.stringify(l);

describe("línea de tiempo", () => {
  it("convierte los lotes en tramos y reconstruye el código", () => {
    const ediciones = [
      lote({ t0: 1000, base: "# x\n", ops: [[0, 4, 4, "p", "t"], [200, 5, 5, "r", "t"]] }),
      lote({ t0: 5000, ops: [[0, 6, 6, "int", "p"]] }),
      // Otra sesión (lleva su texto de partida).
      lote({ t0: 90_000, base: "# x\npr" + "int", ops: [[0, 9, 9, "()", "t"]] }),
      "no es json",
    ];
    const l = lineaDeTiempo("a1", { codigo: "# x\nprint()", ediciones }, "# x\n");
    expect(l.tramos).toHaveLength(2);
    expect(l.tramos[0]).toMatchObject({ motivo: "inicio", texto_inicial: "# x\n", t_inicio: 1000, t_fin: 5000 });
    expect(l.tramos[0].ops[1][0]).toBe(1200);
    expect(l.tramos[1].motivo).toBe("continuacion");
    expect(l.marcas).toEqual([{ t: 5000, tipo: "pegado", dispositivo: "web", datos: { permitido: true } }]);
    expect(l.avisos).toEqual(["1 lote(s) dañado(s) se omitieron"]);
    expect(verificarLinea(l)).toMatchObject({ reconstruye: true, texto: "# x\nprint()" });
    expect(verificarLinea({ ...l, codigo_final: "otra cosa" }).reconstruye).toBe(false);
    expect(operaciones(l)).toHaveLength(4);
  });

  it("ordena los lotes por momento, marca reinicios y avisa del historial truncado", () => {
    const ediciones = [
      lote({ t0: 9000, base: "# inicio\n", ops: [[0, 9, 9, "b", "t"]] }),
      lote({ t0: 1000, base: "# inicio\n", ops: [[0, 9, 9, "a", "t"]] }),
    ];
    const l = lineaDeTiempo("a1", { codigo: "# inicio\nb", ediciones, edicionesTruncadas: true }, "# inicio\n");
    expect(l.tramos.map((t) => t.motivo)).toEqual(["inicio", "reinicio"]);
    expect(l.marcas[0]).toMatchObject({ tipo: "reinicio", t: 9000 });
    expect(l.avisos[0]).toMatch(/límite/);
    expect(verificarLinea(l).reconstruye).toBe(true);
  });

  it("sin historial: el código inicial cuenta como reconstruido", () => {
    const l = lineaDeTiempo("a1", { codigo: "# i\n" }, "# i\n");
    expect(l.tramos).toHaveLength(0);
    expect(verificarLinea(l, "# i\n").reconstruye).toBe(true);
  });

  it("operación fuera de rango", () => {
    const l = lineaDeTiempo("a1", { codigo: "x", ediciones: [lote({ t0: 0, base: "", ops: [[0, 5, 6, "x", "t"]] })] });
    expect(verificarLinea(l)).toMatchObject({ reconstruye: false, error: "operación fuera de rango" });
  });

  it("ritmo: detecta ráfagas de tecleo imposibles", () => {
    const lento = Array.from({ length: 40 }, (_, i) => [i * 400, i, i, "a", "t"] as [number, number, number, string, string]);
    expect(ritmo(lento)).toMatchObject({ tecleados: 40, rafagas: 0 });
    const rapido = Array.from({ length: 100 }, (_, i) => [i * 20, i, i, "a", "t"] as [number, number, number, string, string]);
    const r = ritmo([...rapido, [3000, 0, 0, "xyz", "p"], [3100, 0, 0, "  ", "i"]]);
    expect(r.rafagas).toBe(1);
    expect(r.pegados).toBe(3);
    expect(r.max_cps).toBeGreaterThan(12);
  });
});

describe("CSV", () => {
  it("separa líneas con comillas y distintos separadores", () => {
    expect(separarLinea('1,"Pérez, Ana"')).toEqual(["1", "Pérez, Ana"]);
    expect(separarLinea("1;Ana")).toEqual(["1", "Ana"]);
    expect(separarLinea("1\tAna López")).toEqual(["1", "Ana López"]);
    expect(separarLinea('a,"di ""hola"""')).toEqual(["a", 'di "hola"']);
  });

  it("lee la lista de alumnos con encabezado, errores y repetidos", () => {
    const r = leerListaAlumnos("﻿Número de control,Nombre\n21340500, Karla  Pérez \n\n21340501;Luis Gómez\nmal control,X Y\n21340502,\n21340500,Otra\n21340503\tMaría\tJosé");
    expect(r.filas).toEqual([
      { control: "21340500", nombre: "Karla Pérez", linea: 2 },
      { control: "21340501", nombre: "Luis Gómez", linea: 4 },
      { control: "21340503", nombre: "María José", linea: 8 },
    ]);
    expect(r.errores).toHaveLength(3);
    expect(r.errores[0]).toMatch(/Línea 5/);
  });

  it("aCsv escapa y agrega BOM", () => {
    expect(aCsv([["a", 'b"c', "d,e", null, 3]])).toBe('﻿a,"b""c","d,e",,3\r\n');
  });
});

describe("informes", () => {
  const fila = filaDeAlumno(
    "x1",
    { nombre: "Ana", control: "21", grupo: "g1", uidActual: "u", correo: "21@alumnos.rlp.local", alias: [], debeCambiarClave: false, creado: 1, ultimaSync: 5 },
    {
      actualizado: 9,
      global: { ...contadoresVacios(), pegados_intentos: 1 },
      avance: {
        a1: { completada: true, puntos: 10, pasadas: 1, total: 1, intentos: 2, actualizado: 1 },
        a2: { completada: false, puntos: 0, pasadas: 1, total: 3, intentos: 1, actualizado: 1 },
      },
      notas: { a1: { calificacion: 9.5, comentario: "Bien", actualizado: 1 } },
    },
  );
  const acts = [
    { id: "a1", titulo: "Uno", puntos: 10 },
    { id: "a2", titulo: "Dos", puntos: 10 },
    { id: "a3", titulo: "Tres", puntos: 5 },
  ];

  it("filaDeAlumno une alumno y resumen", () => {
    expect(fila.ultimaSync).toBe(9);
    expect(fila.global.tiempo_ms).toBe(0);
    expect(completadas(fila)).toBe(1);
    expect(puntos(fila)).toBe(10);
  });

  it("CSV de avance y detallado", () => {
    const grupos = [{ id: "g1", nombre: "1A", politicas: { pegado: "bloquear" as const } }];
    const resumen = csvAvance([fila], grupos, acts).split("\r\n");
    expect(resumen[1]).toBe("21,Ana,1A,1,3,33,10,amarillo,1,0,0,1970-01-01 00:00,10,0,");
    const detalle = csvDetalle([fila], grupos, acts).split("\r\n");
    expect(detalle).toHaveLength(4); // encabezado + 2 actividades + línea final vacía
    expect(detalle[1]).toContain("a1,Uno,sí,1,1,10,10,2,0,0,9.5,Bien");
  });

  it("credenciales en CSV y para imprimir (escapadas)", () => {
    const c = [{ alumnoId: "x", control: "21", nombre: "Ana <b>", correo: "", clave: "gato-1234" }];
    expect(csvCredenciales(c, "1A")).toContain("21,Ana <b>,1A,gato-1234");
    const html = htmlCredenciales(c, "1A", "https://ejemplo.github.io/rlp/");
    expect(html).toContain("Ana &lt;b&gt;");
    expect(html).toContain("gato-1234");
  });
});
