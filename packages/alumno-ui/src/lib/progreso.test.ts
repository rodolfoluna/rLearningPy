import { describe, expect, it } from "vitest";
import {
  abrirActividad,
  Cronometro,
  estadoVacio,
  fusionar,
  guardarEdicion,
  PAUSA_MAXIMA_MS,
  registrarPista,
  registrarPruebas,
  registrarRespuesta,
  reiniciarActividad,
  sumarContadores,
  sumarEvento,
} from "./progreso";
import { contadoresVacios } from "./tipos";

describe("progreso de actividades", () => {
  it("abrir crea el estado con el código inicial solo la primera vez", () => {
    const a = abrirActividad(undefined, "print()", 10);
    expect(a).toMatchObject({ codigo: "print()", actualizado: 10, intentos: 0, completada: false });
    const b = abrirActividad({ ...a, codigo: "x = 1" }, "print()", 20);
    expect(b.codigo).toBe("x = 1");
    expect(b.actualizado).toBe(10);
  });

  it("registrarPruebas cuenta intentos y congela los puntos en la primera vez completa", () => {
    let e = estadoVacio("", 0);
    e = registrarPruebas(e, 1, 3, 10, 1);
    expect(e).toMatchObject({ pasadas: 1, total: 3, intentos: 1, completada: false, puntos: 0, actualizado: 1 });
    e = registrarPruebas(e, 3, 3, 10, 2);
    expect(e).toMatchObject({ completada: true, puntos: 10, intentos: 2 });
    e = registrarPruebas(e, 0, 3, 99, 3);
    expect(e).toMatchObject({ completada: true, puntos: 10, intentos: 3, pasadas: 0 });
  });

  it("registrarPruebas con total 0 no completa", () => {
    expect(registrarPruebas(estadoVacio(), 0, 0, 5).completada).toBe(false);
  });

  it("registrarRespuesta guarda la respuesta y completa si es correcta", () => {
    let e = registrarRespuesta(estadoVacio(), "1", false, 5, 1);
    expect(e).toMatchObject({ respuesta: "1", intentos: 1, completada: false });
    e = registrarRespuesta(e, "2", true, 5, 2);
    expect(e).toMatchObject({ respuesta: "2", intentos: 2, completada: true, puntos: 5 });
    e = registrarRespuesta(e, "3", false, 5, 3);
    expect(e).toMatchObject({ completada: true, puntos: 5, intentos: 3 });
  });

  it("registrarPista guarda el máximo", () => {
    expect(registrarPista(registrarPista(estadoVacio(), 2), 1).pistas).toBe(2);
  });

  it("reiniciar vuelve al código inicial y conserva el progreso", () => {
    const e = { ...estadoVacio("x", 0), completada: true, puntos: 5, intentos: 4 };
    expect(reiniciarActividad(e, "inicial", 9)).toMatchObject({ codigo: "inicial", actualizado: 9, completada: true, puntos: 5, intentos: 4 });
  });

  it("guardarEdicion aplica operaciones y compara con el editor", () => {
    const e = estadoVacio("ab", 0);
    const r = guardarEdicion(e, [[0, 2, 2, "c", "t"]], "abc", 5);
    expect(r.resultado).toEqual({ ok: true, codigo: "abc" });
    expect(r.estado).toMatchObject({ codigo: "abc", actualizado: 5 });
    expect(guardarEdicion(e, [[0, 2, 2, "c", "t"]], "otra", 5).resultado.ok).toBe(false);
    const fuera = guardarEdicion(e, [[0, 5, 9, "c", "t"]], "abc", 5);
    expect(fuera.resultado).toEqual({ ok: false, codigo: "ab" });
    expect(guardarEdicion(e, [], "ab", 5).estado).toBe(e);
  });

  it("fusionar: el código remoto gana si es más nuevo; completada O; máximos", () => {
    const local = { ...estadoVacio("local", 10), completada: true, puntos: 5, intentos: 3, pistas: 1 };
    const remoto = { ...estadoVacio("remoto", 20), intentos: 5, pistas: 2 };
    expect(fusionar(local, remoto)).toMatchObject({ codigo: "remoto", completada: true, puntos: 5, intentos: 5, pistas: 2 });
    expect(fusionar(local, { ...remoto, actualizado: 5 }).codigo).toBe("local");
    expect(fusionar(undefined, remoto)).toEqual(remoto);
  });
});

describe("contadores", () => {
  it("sumarEvento sigue la tabla de estadísticas", () => {
    const c = contadoresVacios();
    sumarEvento(c, "ejecucion", { estado: "error" });
    sumarEvento(c, "prueba", { pasadas: 2, total: 2 });
    sumarEvento(c, "pegado", { permitido: false });
    sumarEvento(c, "foco", { estado: "perdido" });
    sumarEvento(c, "foco", { estado: "recuperado", fuera_ms: 500 });
    sumarEvento(c, "edicion", { ops: [[0, 0, 0, "a", "t"], [0, 0, 0, "\n", "i"]] });
    expect(c).toMatchObject({ ejecuciones: 1, errores: 1, pruebas: 1, pruebas_exitosas: 1, pegados_intentos: 1, salidas: 1, tiempo_fuera_ms: 500, teclas: 1 });
  });

  it("Cronometro suma intervalos cortos y no cuenta el tiempo fuera", () => {
    const c = new Cronometro();
    expect(c.evento(0, "actividad_abierta", "a", {})).toBeNull();
    expect(c.evento(1000, "edicion", "a", {})).toEqual(["a", 1000]);
    expect(c.evento(1000 + PAUSA_MAXIMA_MS, "edicion", "a", {})).toBeNull();
    c.evento(2_000_000, "foco", "a", { estado: "perdido" });
    expect(c.evento(2_005_000, "foco", "a", { estado: "recuperado" })).toBeNull();
  });

  it("sumarContadores", () => {
    expect(sumarContadores({ ...contadoresVacios(), copias: 1 }, { copias: 2, teclas: 3 })).toMatchObject({ copias: 3, teclas: 3 });
  });
});
