import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alCambiarRed,
  calcularEstadoSync,
  clasificarRed,
  decidirSync,
  guardarAjusteSync,
  leerAjusteSync,
  simularRed,
  tipoRed,
  type AjusteSync,
  type TipoRed,
} from "./red";

class ConexionFalsa extends EventTarget {
  constructor(
    public type?: string,
    public saveData = false,
  ) {
    super();
  }
}

function conNavegador(connection?: ConexionFalsa) {
  vi.stubGlobal("navigator", connection ? { connection } : {});
}

afterEach(() => {
  simularRed(null);
  vi.unstubAllGlobals();
});

describe("tipoRed", () => {
  it("wifi y ethernet cuentan como Wi‑Fi", () => {
    conNavegador(new ConexionFalsa("wifi"));
    expect(tipoRed()).toBe("wifi");
    expect(clasificarRed({ type: "ethernet" })).toBe("wifi");
  });

  it("cellular es datos móviles", () => {
    conNavegador(new ConexionFalsa("cellular"));
    expect(tipoRed()).toBe("celular");
  });

  it("sin la API (iPhone, Firefox) o sin `type` (Chrome de escritorio) es desconocida", () => {
    conNavegador();
    expect(tipoRed()).toBe("desconocida");
    conNavegador(new ConexionFalsa(undefined));
    expect(tipoRed()).toBe("desconocida");
    expect(clasificarRed({ type: "unknown" })).toBe("desconocida");
    vi.stubGlobal("navigator", undefined);
    expect(tipoRed()).toBe("desconocida");
  });

  it("el Ahorro de datos (saveData) cuenta como datos móviles aunque diga Wi‑Fi", () => {
    conNavegador(new ConexionFalsa("wifi", true));
    expect(tipoRed()).toBe("celular");
    expect(clasificarRed({ saveData: true })).toBe("celular");
  });

  it("simularRed tiene prioridad y avisa el cambio", () => {
    conNavegador(new ConexionFalsa("wifi"));
    const vistos: TipoRed[] = [];
    const quitar = alCambiarRed((t) => vistos.push(t));
    simularRed("celular");
    simularRed("celular"); // sin cambio: no avisa otra vez
    simularRed(null);
    quitar();
    simularRed("celular");
    expect(vistos).toEqual(["celular", "wifi"]);
  });

  it("alCambiarRed escucha el evento change de navigator.connection", () => {
    const c = new ConexionFalsa("cellular");
    conNavegador(c);
    const vistos: TipoRed[] = [];
    const quitar = alCambiarRed((t) => vistos.push(t));
    c.type = "wifi";
    c.dispatchEvent(new Event("change"));
    c.dispatchEvent(new Event("change"));
    c.saveData = true;
    c.dispatchEvent(new Event("change"));
    quitar();
    c.type = "cellular";
    c.saveData = false;
    c.dispatchEvent(new Event("change"));
    expect(vistos).toEqual(["wifi", "celular"]);
  });
});

describe("política de sincronización", () => {
  const casos: [AjusteSync, TipoRed, "auto" | "preguntar"][] = [
    ["wifi", "wifi", "auto"],
    ["wifi", "desconocida", "auto"],
    ["wifi", "celular", "preguntar"],
    ["siempre", "wifi", "auto"],
    ["siempre", "celular", "auto"],
    ["siempre", "desconocida", "auto"],
    ["manual", "wifi", "preguntar"],
    ["manual", "celular", "preguntar"],
    ["manual", "desconocida", "preguntar"],
  ];
  it.each(casos)("ajuste %s con red %s → %s", (ajuste, tipo, esperado) => {
    expect(decidirSync(ajuste, tipo)).toBe(esperado);
  });

  it("estado del indicador", () => {
    const base = { enLinea: true, pausada: false, enviando: false, pendiente: false };
    expect(calcularEstadoSync(base)).toBe("sincronizado");
    expect(calcularEstadoSync({ ...base, pendiente: true })).toBe("sincronizando");
    expect(calcularEstadoSync({ ...base, pausada: true })).toBe("en-pausa");
    expect(calcularEstadoSync({ ...base, pausada: true, pendiente: true })).toBe("pendiente-datos");
    expect(calcularEstadoSync({ ...base, pendiente: true, enviando: true })).toBe("enviando-datos");
    // Sin conexión gana siempre (el texto de siempre: "cambios guardados en este equipo").
    expect(calcularEstadoSync({ ...base, enLinea: false, pausada: true, pendiente: true })).toBe("sin-conexion");
  });

  it("el ajuste se guarda por dispositivo y aguanta sin localStorage", () => {
    const datos = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
    });
    expect(leerAjusteSync()).toBe("wifi");
    guardarAjusteSync("manual");
    expect(leerAjusteSync()).toBe("manual");
    datos.set("rlp-sync", "otro");
    expect(leerAjusteSync()).toBe("wifi");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(leerAjusteSync()).toBe("wifi");
    expect(() => guardarAjusteSync("siempre")).not.toThrow();
  });
});
