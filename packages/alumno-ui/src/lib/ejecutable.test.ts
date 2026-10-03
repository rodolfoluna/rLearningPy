import { describe, expect, it } from "vitest";
import { armarRemolque, leerRemolque, limpiarNombre, nombreSugerido } from "./ejecutable";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("remolque del .exe", () => {
  it("tiene los mismos bytes que espera el lanzador (lanzador/src/remolque.rs)", () => {
    // Mismo ejemplo que la prueba `mismo_formato_que_typescript` en Rust.
    expect(hex(armarRemolque("print('¡hola!')\n", "Mi programa"))).toBe(
      "4d692070726f6772616d610b000000524c504e4f4d42527072696e742827c2a1686f6c612127290a11000000524c505343525054",
    );
  });

  it("termina con [script][largo u32 LE]['RLPSCRPT']", () => {
    const script = "x = input('¿Edad? ')\nprint('Tienes', x, 'años')\n";
    const r = armarRemolque(script, "Edad");
    const bytes = new TextEncoder().encode(script);
    expect(new TextDecoder().decode(r.subarray(-8))).toBe("RLPSCRPT");
    expect(new DataView(r.buffer).getUint32(r.length - 12, true)).toBe(bytes.length);
    expect(hex(r.subarray(r.length - 12 - bytes.length, r.length - 12))).toBe(hex(bytes));
  });

  it("se lee de vuelta pegado a un lanzador", () => {
    const lanzador = new TextEncoder().encode("MZ lanzador falso con RLPSCRPT adentro");
    const remolque = armarRemolque("print('ñandú')", "Ñandú");
    const exe = new Uint8Array(lanzador.length + remolque.length);
    exe.set(lanzador);
    exe.set(remolque, lanzador.length);
    expect(leerRemolque(exe)).toEqual({ nombre: "Ñandú", script: "print('ñandú')" });
  });

  it("sin nombre y sin remolque", () => {
    expect(leerRemolque(armarRemolque("print(1)"))).toEqual({ script: "print(1)" });
    expect(leerRemolque(new TextEncoder().encode("MZ nada"))).toBeNull();
    expect(leerRemolque(new Uint8Array())).toBeNull();
  });
});

describe("nombre del programa", () => {
  it("quita caracteres inválidos en Windows", () => {
    expect(limpiarNombre('mi:prog*ra?ma<1>|"x"')).toBe("mi_prog_ra_ma_1___x_");
    expect(limpiarNombre("  Calculadora de áreas.exe ")).toBe("Calculadora de áreas");
    expect(limpiarNombre("carpeta/../otro\\x")).toBe("carpeta_.._otro_x");
    expect(limpiarNombre("...")).toBe("programa");
    expect(limpiarNombre("")).toBe("programa");
    expect(limpiarNombre("CON")).toBe("CON_");
    expect(limpiarNombre("a".repeat(100))).toHaveLength(60);
  });

  it("sugerencia desde la actividad", () => {
    expect(nombreSugerido("u2-calculadora-de-propinas")).toBe("calculadora_de_propinas");
  });
});
