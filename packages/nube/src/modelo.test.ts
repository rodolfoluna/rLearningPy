import { describe, expect, it } from "vitest";
import { correoAlumno, generarContrasena, normalizarControl, rutas } from "./modelo";

describe("modelo", () => {
  it("correoAlumno traduce el número de control al correo sintético", () => {
    expect(correoAlumno("21340500")).toBe("21340500@alumnos.rlp.local");
    expect(correoAlumno(" C21340500 ", 2)).toBe("c21340500+r2@alumnos.rlp.local");
    expect(() => correoAlumno("21 34")).toThrow();
    expect(() => correoAlumno("a@b")).toThrow();
    expect(normalizarControl("AbC-1")).toBe("abc-1");
  });

  it("generarContrasena da contraseñas legibles de al menos 8 caracteres", () => {
    for (let i = 0; i < 200; i++) {
      const c = generarContrasena();
      expect(c).toMatch(/^[a-z]+(-[a-z]+)?-\d{4}$/);
      expect(c.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("rutas", () => {
    expect(rutas.actividad("a1", "u0-x")).toBe("alumnos/a1/actividades/u0-x");
    expect(rutas.contadores("a1")).toBe("alumnos/a1/resumen/contadores");
    expect(rutas.login(" 123 ")).toBe("logins/123");
  });
});
