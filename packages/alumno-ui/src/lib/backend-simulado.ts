// Simulación en memoria del núcleo, para desarrollar y probar la interfaz sin Firebase.
//
// Cuentas de demostración (en memoria, se pierden al recargar):
//  - Cualquier número de control con la contraseña temporal `gato-1234`: entra como alumno nuevo
//    y debe cambiar la contraseña.
//  - `profesor@demo.local` / `profesor-demo`: entra al área del profesor.
// Con `?sin-conexion` el indicador muestra "Sin conexión". Con `?red=celular` (o `wifi`,
// `desconocida`) se simula el tipo de red: con datos móviles los cambios quedan "sin enviar" hasta
// tocar "Enviar ahora" o pasar a Wi‑Fi; `?pendientes-desde=<horas>` simula avances viejos sin enviar.

import {
  alCambiarRed,
  calcularEstadoSync,
  decidirSync,
  leerAjusteSync,
  guardarAjusteSync,
  simularRed,
  tipoRed,
  type TipoRed,
} from "@rlp/nube/red";
import type { Backend } from "./backend";
import * as progreso from "./progreso";
import {
  contadoresVacios,
  type EstadoActividad,
  type EstadoAlumno,
  type EstadoSincronizacion,
  type Estadisticas,
  type GrupoInfo,
} from "./tipos";

export const CLAVE_TEMPORAL_DEMO = "gato-1234";
export const PROFESOR_DEMO = { correo: "profesor@demo.local", clave: "profesor-demo" };

const GRUPO_DEMO: GrupoInfo = {
  grupo_id: "demo",
  nombre: "Grupo de demostración",
  politicas: { pegado: "bloquear", registrar_salidas: true },
};

interface Cuenta {
  clave: string;
  alumno: EstadoAlumno;
}

export function crearBackendSimulado(): Backend {
  const cuentas = new Map<string, Cuenta>();
  let actual: Cuenta | null = null;
  let hayProfesor = true;
  const cronometro = new progreso.Cronometro();
  const sincronizacion = new Set<(e: EstadoSincronizacion) => void>();

  const sesion = () => {
    if (!actual) throw new Error("No hay sesión iniciada.");
    return actual.alumno;
  };
  const copia = <T>(v: T): T => structuredClone(v);
  const est = (): Estadisticas => sesion().estadisticas;
  const registrar = (tipo: string, actividad: string | null, datos: Record<string, unknown> = {}) => {
    const e = est();
    const t = cronometro.evento(Date.now(), tipo, actividad, datos);
    if (t) {
      e.global.tiempo_ms += t[1];
      (e.por_actividad[t[0]] ??= contadoresVacios()).tiempo_ms += t[1];
    }
    progreso.sumarEvento(e.global, tipo, datos);
    if (actividad) progreso.sumarEvento((e.por_actividad[actividad] ??= contadoresVacios()), tipo, datos);
  };
  const act = (id: string): EstadoActividad => (sesion().actividades[id] ??= progreso.estadoVacio());
  const guardar = (id: string, e: EstadoActividad) => {
    sesion().actividades[id] = e;
    return copia(e);
  };
  const retrasar = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 30));

  // Red simulada y política de sincronización (la misma regla que el núcleo con Firebase).
  const params = new URLSearchParams(location.search);
  const redPedida = params.get("red");
  if (redPedida === "celular" || redPedida === "wifi" || redPedida === "desconocida") simularRed(redPedida as TipoRed);
  let ajuste = leerAjusteSync();
  let tipo = tipoRed();
  let pendientesDesde: number | null = null;
  let enviando = false;
  const pausada = () => !!actual && decidirSync(ajuste, tipo) === "preguntar";
  const estadoSync = (): EstadoSincronizacion =>
    calcularEstadoSync({
      enLinea: !params.has("sin-conexion"),
      pausada: pausada(),
      enviando,
      pendiente: pendientesDesde !== null,
    });
  const avisarSync = () => {
    if (!actual) return;
    const e = estadoSync();
    sincronizacion.forEach((f) => f(e));
  };
  /** Un cambio "se guarda": con la red en pausa queda pendiente; si no, se envía al momento. */
  const escribio = () => {
    if (pausada()) pendientesDesde ??= Date.now();
    avisarSync();
  };
  alCambiarRed((t) => {
    tipo = t;
    if (!pausada()) pendientesDesde = null;
    avisarSync();
  });

  return {
    estadoApp: async () => ({
      version: "0.3.0-simulado",
      plataforma: new URLSearchParams(location.search).has("android") ? "android" : "navegador",
      dev: true,
      hay_profesor: hayProfesor,
    }),
    reanudarSesion: async () => null,
    async iniciarSesion(usuario, clave) {
      const id = usuario.trim().toLowerCase();
      if (id.includes("@")) {
        if (id !== PROFESOR_DEMO.correo || clave !== PROFESOR_DEMO.clave) throw new Error("Correo o contraseña incorrectos.");
        actual = null;
        return retrasar({ rol: "profesor" as const });
      }
      let c = cuentas.get(id);
      if (!c && clave === CLAVE_TEMPORAL_DEMO) {
        c = {
          clave,
          alumno: {
            perfil: { perfil_id: `a-${id}`, numero_control: id, nombre: `Alumno ${id}`, creado: Date.now() },
            grupo: new URLSearchParams(location.search).has("sin-grupo") ? null : GRUPO_DEMO,
            actividades: {},
            estadisticas: { global: contadoresVacios(), por_actividad: {} },
            debe_cambiar_clave: true,
          },
        };
        cuentas.set(id, c);
      }
      if (!c || c.clave !== clave) throw new Error("Número de control o contraseña incorrectos.");
      actual = c;
      registrar("sesion_inicio", null);
      const horas = Number(params.get("pendientes-desde"));
      if (horas > 0 && pausada()) pendientesDesde = Date.now() - horas * 3600_000;
      avisarSync();
      return retrasar({ rol: "alumno" as const, estado: copia(c.alumno) });
    },
    async configurarProfesor(correo, clave) {
      if (hayProfesor) throw new Error("Ya hay un profesor configurado.");
      if (clave.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      PROFESOR_DEMO.correo = correo.trim().toLowerCase();
      PROFESOR_DEMO.clave = clave;
      hayProfesor = true;
    },
    async cambiarContrasenaInicial(nueva) {
      if (nueva.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      actual!.clave = nueva;
      sesion().debe_cambiar_clave = false;
    },
    cambiarContrasena: async (a, n) => {
      if (a !== actual?.clave) throw new Error("Contraseña incorrecta.");
      if (n.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      actual.clave = n;
    },
    cerrarSesion: async () => {
      actual = null;
      pendientesDesde = null;
    },
    estado: async () => copia(sesion()),
    estadisticas: async () => copia(est()),
    async abrirActividad(id, codigoInicial) {
      registrar("actividad_abierta", id);
      escribio();
      return guardar(id, progreso.abrirActividad(sesion().actividades[id], codigoInicial));
    },
    async guardarEdicion(id, lote, texto) {
      const r = progreso.guardarEdicion(act(id), lote.ops, texto);
      guardar(id, r.estado);
      registrar("edicion", id, { ops: lote.ops });
      escribio();
      return r.resultado;
    },
    reiniciarActividad: async (id, codigoInicial) => guardar(id, progreso.reiniciarActividad(act(id), codigoInicial)),
    async registrarPruebas(id, pasadas, total, puntos) {
      registrar("prueba", id, { pasadas, total });
      escribio();
      return guardar(id, progreso.registrarPruebas(act(id), pasadas, total, puntos));
    },
    async registrarRespuesta(id, respuesta, correcta, puntos) {
      registrar("respuesta", id, { correcta });
      escribio();
      return guardar(id, progreso.registrarRespuesta(act(id), respuesta, correcta, puntos));
    },
    async registrarPista(id, numero) {
      registrar("pista", id, { numero });
      return guardar(id, progreso.registrarPista(act(id), numero));
    },
    registrarEvento: async (tipo, actividad, datos) => registrar(tipo, actividad, datos),
    vaciar: async () => undefined,
    alSincronizar(fn) {
      sincronizacion.add(fn);
      return () => sincronizacion.delete(fn);
    },
    alCambiarAlumno: () => () => undefined,
    infoRed: () => ({ tipo, ajuste, pendientesDesde }),
    cambiarAjusteSync(a) {
      ajuste = a;
      guardarAjusteSync(a);
      if (!pausada()) pendientesDesde = null;
      avisarSync();
    },
    enviarAhora() {
      if (!pausada() || enviando) return;
      enviando = true;
      avisarSync();
      setTimeout(() => {
        enviando = false;
        pendientesDesde = null;
        avisarSync();
      }, 800);
    },
  };
}
