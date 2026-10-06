// Datos del profesor simulados en memoria (con `?simulado` o sin configuración de Firebase en
// `vite dev`), para desarrollar y probar la interfaz sin nube. Se pierden al recargar.
//
// Alumnos de demostración: Ana (avanzada, sin alertas), Bruno (intentos de pegar: amarillo),
// Carla (inserciones sospechosas: rojo) y Diego (recién creado, debe cambiar su contraseña).

import {
  contadoresVacios,
  correoAlumno,
  generarContrasena,
  normalizarControl,
  POLITICAS_POR_DEFECTO,
  resumenAvance,
  type Contadores,
  type Credenciales,
  type DocActividad,
  type LoteEdiciones,
  type NotaProfesor,
} from "@rlp/nube";
import type { DatosProfesor } from "./datos";
import type { Actividad, AlumnoFila, Grupo } from "./tipos";

const MIN = 60_000;

/** Escribe `texto` tecla a tecla al final de `base` (un lote por línea, ~3 caracteres/s). */
function tecleo(base: string, texto: string, t0: number, conPegado?: string): LoteEdiciones[] {
  const lotes: LoteEdiciones[] = [];
  let pos = base.length;
  let t = t0;
  let lote: LoteEdiciones = { t0: t, ops: [], base };
  for (const c of texto) {
    lote.ops.push([t - lote.t0, pos, pos, c, c === "\n" ? "i" : "t"]);
    pos += c.length;
    t += 320;
    if (c === "\n") {
      lotes.push(lote);
      t += 4000;
      lote = { t0: t, ops: [] };
    }
  }
  if (conPegado) {
    lote.ops.push([t - lote.t0, pos, pos, conPegado, "p"]);
    pos += conPegado.length;
  }
  if (lote.ops.length) lotes.push(lote);
  return lotes;
}

interface Registro {
  fila: AlumnoFila;
  actividades: Map<string, Actividad>;
}

export function crearDatosSimulados(): DatosProfesor {
  const ahora = Date.now();
  const grupos = new Map<string, Grupo>([
    ["g-1a", { id: "g-1a", nombre: "Programación 1A", politicas: { ...POLITICAS_POR_DEFECTO }, creado: ahora - 30 * 24 * 60 * MIN }],
  ]);
  const alumnos = new Map<string, Registro>();
  let n = 0;

  const nuevoRegistro = (control: string, nombre: string, grupo: string | null, debeCambiarClave = false): Registro => {
    const id = `sim-${++n}`;
    const r: Registro = {
      fila: {
        id,
        nombre,
        control,
        grupo,
        correo: correoAlumno(control),
        debeCambiarClave,
        creado: ahora - 20 * 24 * 60 * MIN,
        ultimaSync: debeCambiarClave ? null : ahora - n * 7 * MIN,
        conDatosMoviles: n % 4 === 2, // algunos envían con datos móviles (📶)
        global: contadoresVacios(),
        porActividad: {},
        avance: {},
        notas: {},
      },
      actividades: new Map(),
    };
    alumnos.set(id, r);
    return r;
  };

  const sumar = (r: Registro, act: string, c: Partial<Contadores>) => {
    const p = (r.fila.porActividad[act] ??= contadoresVacios());
    for (const [k, v] of Object.entries(c) as [keyof Contadores, number][]) {
      p[k] += v;
      r.fila.global[k] += v;
    }
  };

  const ponerActividad = (r: Registro, id: string, d: Partial<DocActividad>) => {
    const a: Actividad = { codigo: "", completada: false, pasadas: 0, total: 0, puntos: 0, intentos: 1, respuesta: null, pistas: 0, actualizado: ahora - 3 * MIN, ...d };
    r.actividades.set(id, a);
    r.fila.avance[id] = resumenAvance(a);
  };

  const inicialHola = "# Escribe tu programa debajo de esta línea\n";
  const inicialSuma = "# Pide los dos números y conviértelos a entero\n";
  const suma = 'a = int(input("Primer número: "))\nb = int(input("Segundo número: "))\nprint("La suma es", a + b)\n';

  // Ana: avanzada y sin alertas.
  const ana = nuevoRegistro("21340001", "Ana López", "g-1a");
  ponerActividad(ana, "u0-hola-mundo", { codigo: inicialHola + 'print("Hola, mundo")\n', completada: true, pasadas: 1, total: 1, puntos: 10 });
  ponerActividad(ana, "u0-que-hace-print", { respuesta: "1", completada: true, puntos: 5 });
  ponerActividad(ana, "u1-suma-dos-numeros", {
    codigo: inicialSuma + suma,
    completada: true,
    pasadas: 3,
    total: 3,
    puntos: 10,
    intentos: 2,
    ediciones: tecleo(inicialSuma, suma, ahora - 50 * MIN).map((l) => JSON.stringify(l)),
  });
  sumar(ana, "u1-suma-dos-numeros", { tiempo_ms: 14 * MIN, ejecuciones: 4, pruebas: 2, pruebas_exitosas: 1, teclas: 120 });
  ana.fila.notas["u0-hola-mundo"] = { calificacion: 10, comentario: "¡Muy bien!", actualizado: ahora - 60 * MIN };
  ana.actividades.get("u0-hola-mundo")!.nota = ana.fila.notas["u0-hola-mundo"];

  // Bruno: intentos de pegar y un pegado permitido en el historial.
  const bruno = nuevoRegistro("21340002", "Bruno Martínez", "g-1a");
  const sumaBruno = 'a = int(input("Primer número: "))\nb = int(input("Segundo número: "))\n';
  ponerActividad(bruno, "u0-hola-mundo", { codigo: inicialHola + 'print("Hola, mundo")\n', completada: true, pasadas: 1, total: 1, puntos: 10 });
  ponerActividad(bruno, "u1-suma-dos-numeros", {
    codigo: inicialSuma + sumaBruno + 'print("La suma es", a + b)',
    completada: true,
    pasadas: 3,
    total: 3,
    puntos: 10,
    intentos: 3,
    ediciones: tecleo(inicialSuma, sumaBruno, ahora - 40 * MIN, 'print("La suma es", a + b)').map((l) => JSON.stringify(l)),
  });
  sumar(bruno, "u1-suma-dos-numeros", { tiempo_ms: 9 * MIN, pegados_intentos: 2, pegados_permitidos: 1, copias: 1, salidas: 3, tiempo_fuera_ms: 2 * MIN });

  // Carla: inserciones sospechosas (rojo).
  const carla = nuevoRegistro("21340003", "Carla Ruiz", null);
  ponerActividad(carla, "u0-hola-mundo", { codigo: 'print("Hola, mundo")\n', completada: true, pasadas: 1, total: 1, puntos: 10, ediciones: [] });
  sumar(carla, "u0-hola-mundo", { tiempo_ms: 1 * MIN, inserciones_sospechosas: 2, pegados_intentos: 6 });

  // Diego: recién creado.
  nuevoRegistro("21340004", "Diego Sánchez", "g-1a", true);

  // ---------------------------------------------------------------- suscripciones

  const oyentesAlumnos = new Set<(a: AlumnoFila[]) => void>();
  const oyentesGrupos = new Set<(g: Grupo[]) => void>();
  const oyentesActividad = new Set<{ alumno: string; act: string; fn: (a: Actividad | null) => void }>();
  const lista = () => [...alumnos.values()].map((r) => structuredClone(r.fila)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const listaGrupos = () => [...grupos.values()].map((g) => structuredClone(g)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const avisar = () => {
    const l = lista();
    oyentesAlumnos.forEach((f) => f(l));
    oyentesGrupos.forEach((f) => f(listaGrupos()));
    for (const o of oyentesActividad) {
      const a = alumnos.get(o.alumno)?.actividades.get(o.act);
      o.fn(a ? structuredClone(a) : null);
    }
  };
  const tarde = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 40));
  const registro = (id: string) => {
    const r = alumnos.get(id);
    if (!r) throw new Error("El alumno no existe.");
    return r;
  };

  const credenciales = (r: Registro, clave: string): Credenciales => ({
    alumnoId: r.fila.id,
    control: r.fila.control,
    nombre: r.fila.nombre,
    correo: r.fila.correo,
    clave,
  });

  return {
    correo: () => "profesor@demo.local",
    escucharAlumnos(fn) {
      oyentesAlumnos.add(fn);
      setTimeout(() => fn(lista()), 30);
      return () => oyentesAlumnos.delete(fn);
    },
    escucharGrupos(fn) {
      oyentesGrupos.add(fn);
      setTimeout(() => fn(listaGrupos()), 10);
      return () => oyentesGrupos.delete(fn);
    },
    escucharActividad(alumno, act, fn) {
      const o = { alumno, act, fn };
      oyentesActividad.add(o);
      setTimeout(() => {
        const a = alumnos.get(alumno)?.actividades.get(act);
        fn(a ? structuredClone(a) : null);
      }, 10);
      return () => oyentesActividad.delete(o);
    },
    async crearAlumno(nuevo) {
      const control = normalizarControl(nuevo.control);
      if (nuevo.nombre.trim().length < 3) throw new Error(`Falta el nombre del alumno ${control}.`);
      if ([...alumnos.values()].some((r) => r.fila.control === control)) {
        throw new Error(`Ya existe un alumno con el número de control ${control}.`);
      }
      const r = nuevoRegistro(control, nuevo.nombre.trim(), nuevo.grupo ?? null, true);
      avisar();
      return tarde(credenciales(r, nuevo.clave ?? generarContrasena()));
    },
    async restablecerAlumno(id) {
      const r = registro(id);
      r.fila.debeCambiarClave = true;
      avisar();
      return tarde(credenciales(r, generarContrasena()));
    },
    async actualizarAlumno(id, cambios) {
      Object.assign(registro(id).fila, cambios);
      avisar();
    },
    async eliminarAlumno(id) {
      alumnos.delete(id);
      avisar();
    },
    async guardarGrupo(id, d) {
      const gid = id ?? `g-${Date.now().toString(36)}`;
      const previo = grupos.get(gid);
      grupos.set(gid, {
        id: gid,
        nombre: d.nombre,
        creado: previo?.creado ?? Date.now(),
        politicas: { ...POLITICAS_POR_DEFECTO, ...previo?.politicas, ...d.politicas },
      });
      avisar();
      return gid;
    },
    async eliminarGrupo(id) {
      grupos.delete(id);
      for (const r of alumnos.values()) if (r.fila.grupo === id) r.fila.grupo = null;
      avisar();
    },
    async calificar(alumnoId, act, nota) {
      const r = registro(alumnoId);
      const valor: NotaProfesor | null = nota ? { ...nota, actualizado: Date.now() } : null;
      if (valor) r.fila.notas[act] = valor;
      else delete r.fila.notas[act];
      const a = r.actividades.get(act) ?? {};
      r.actividades.set(act, { ...a, nota: valor });
      avisar();
    },
  };
}
