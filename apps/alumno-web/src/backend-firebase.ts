// Núcleo de la app con Firebase (Auth + Firestore con caché persistente).
//
// Regla de oro: la interfaz nunca espera al servidor. Cada cambio se aplica primero en memoria,
// se escribe con setDoc(..., {merge: true}) sin `await` (Firestore lo guarda en IndexedDB y lo
// envía solo al volver la red) y el indicador de sincronización sigue `waitForPendingWrites`.
//
// Para ahorrar escrituras (plan Spark: 20 000/día):
//  - las operaciones del editor (`ediciones`) y el código se agrupan y se escriben cada ~10 s,
//    o antes al salir de la ventana, cambiar de actividad, probar o cerrar;
//  - los contadores se suman en memoria y se escriben con `increment()` cada ~15 s.

import {
  auth,
  cambiarClave,
  cambiarClaveInicial,
  cerrarSesionAlumno,
  configurarProfesor,
  contadoresVacios as contadoresNube,
  db,
  hayProfesor,
  iniciarSesion as iniciarSesionNube,
  POLITICAS_POR_DEFECTO,
  rolDeUsuario,
  rutas,
  sesionGuardada,
  type DocActividad,
  type DocAlumno,
  type DocContadores,
  type DocGrupo,
  type LoteEdiciones,
  type SesionIniciada as SesionNube,
} from "@rlp/nube";
import {
  progreso,
  type Backend,
  type Contadores,
  type EstadoActividad,
  type EstadoAlumno,
  type EstadoSincronizacion,
  type Estadisticas,
  type GrupoInfo,
  type SesionIniciada,
} from "@rlp/alumno-ui";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  increment,
  onSnapshot,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";

export const INTERVALO_EDICIONES_MS = 10_000;
export const INTERVALO_CONTADORES_MS = 15_000;
/** Pasado este tamaño (caracteres) ya no se agregan ediciones: el documento no debe pasar de 1 MB. */
const LIMITE_EDICIONES = 700_000;
/** Cuánto esperar al servidor en una lectura antes de usar la caché. */
const ESPERA_LECTURA_MS = 4000;
/** `ultimaSync` se escribe a lo más una vez por minuto. */
const INTERVALO_ULTIMA_SYNC_MS = 60_000;

const contadoresVacios = contadoresNube as () => Contadores;

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("tiempo agotado")), ms))]);
}

/** Lee un documento del servidor si responde pronto; si no, de la caché local. */
async function leerDoc<T>(ref: DocumentReference): Promise<T | undefined> {
  let s: DocumentSnapshot;
  try {
    s = navigator.onLine ? await conLimite(getDoc(ref), ESPERA_LECTURA_MS) : await getDocFromCache(ref);
  } catch {
    try {
      s = await getDocFromCache(ref);
    } catch {
      return undefined;
    }
  }
  return s.exists() ? (s.data() as T) : undefined;
}

async function leerColeccion(ruta: string): Promise<QuerySnapshot | null> {
  const ref = collection(db(), ruta);
  try {
    return navigator.onLine ? await conLimite(getDocs(ref), ESPERA_LECTURA_MS * 2) : await getDocsFromCache(ref);
  } catch {
    try {
      return await getDocsFromCache(ref);
    } catch {
      return null;
    }
  }
}

function aEstado(d: Partial<DocActividad>): EstadoActividad {
  return {
    codigo: d.codigo ?? "",
    completada: !!d.completada,
    pasadas: d.pasadas ?? 0,
    total: d.total ?? 0,
    puntos: d.puntos ?? 0,
    intentos: d.intentos ?? 0,
    respuesta: d.respuesta ?? null,
    pistas: d.pistas ?? 0,
    actualizado: d.actualizado ?? 0,
    nota: d.nota ?? null,
  };
}

function aGrupo(id: string, g: DocGrupo | undefined): GrupoInfo | null {
  if (!g) return null;
  const p = { ...POLITICAS_POR_DEFECTO, ...g.politicas };
  return { grupo_id: id, nombre: g.nombre, politicas: { pegado: p.pegado, registrar_salidas: p.registrarSalidas ?? true } };
}

function tamEdiciones(d: Partial<DocActividad>): number {
  return (d.ediciones ?? []).reduce((s, e) => s + e.length, 0);
}

type Delta = Partial<Contadores>;

/** Estado de la sesión de un alumno (todo en memoria; Firestore es la copia durable). */
class SesionAlumno {
  actividades: Record<string, EstadoActividad> = {};
  estadisticas: Estadisticas = { global: contadoresVacios(), por_actividad: {} };
  grupo: GrupoInfo | null = null;
  private tamanos = new Map<string, number>();
  private ediciones = new Map<string, { lotes: LoteEdiciones[]; base?: string }>();
  private conBase = new Set<string>();
  private delta: { global: Delta; por_actividad: Record<string, Delta> } = { global: {}, por_actividad: {} };
  private hayDelta = false;
  private tEdiciones: ReturnType<typeof setTimeout> | null = null;
  private tContadores: ReturnType<typeof setTimeout> | null = null;
  private cronometro = new progreso.Cronometro();
  private quitar: (() => void)[] = [];

  constructor(
    readonly alumnoId: string,
    public datos: DocAlumno,
    private readonly nucleo: NucleoFirebase,
  ) {}

  ref(id: string) {
    return doc(db(), rutas.actividad(this.alumnoId, id));
  }

  estado(): EstadoAlumno {
    return {
      perfil: {
        perfil_id: this.alumnoId,
        numero_control: this.datos.control,
        nombre: this.datos.nombre,
        creado: this.datos.creado,
      },
      grupo: this.grupo,
      actividades: structuredClone(this.actividades),
      estadisticas: structuredClone(this.estadisticas),
      debe_cambiar_clave: !!this.datos.debeCambiarClave,
    };
  }

  async cargar() {
    const [acts, cont] = await Promise.all([
      leerColeccion(rutas.actividades(this.alumnoId)),
      leerDoc<DocContadores>(doc(db(), rutas.contadores(this.alumnoId))),
    ]);
    for (const d of acts?.docs ?? []) {
      const datos = d.data() as Partial<DocActividad>;
      this.actividades[d.id] = aEstado(datos);
      this.tamanos.set(d.id, tamEdiciones(datos));
    }
    if (cont) {
      this.estadisticas = {
        global: { ...contadoresVacios(), ...cont.global },
        por_actividad: Object.fromEntries(
          Object.entries(cont.por_actividad ?? {}).map(([k, v]) => [k, { ...contadoresVacios(), ...v }]),
        ),
      };
    }
    await this.cargarGrupo();
  }

  private async cargarGrupo() {
    const id = this.datos.grupo;
    this.grupo = id ? aGrupo(id, await leerDoc<DocGrupo>(doc(db(), rutas.grupo(id)))) : null;
  }

  /** Escucha cambios de otro equipo o del profesor (actividades, grupo, contraseña). */
  escuchar() {
    const alError = (e: Error) => console.warn("Sin cambios de la nube:", e.message);
    this.quitar.push(
      onSnapshot(
        collection(db(), rutas.actividades(this.alumnoId)),
        (s) => {
          let hubo = false;
          for (const c of s.docChanges()) {
            if (c.type === "removed" || c.doc.metadata.hasPendingWrites) continue;
            const remoto = aEstado(c.doc.data() as Partial<DocActividad>);
            const local = this.actividades[c.doc.id];
            if (this.ediciones.has(c.doc.id)) continue; // hay cambios propios por enviar: gana lo local
            const nuevo = progreso.fusionar(local, remoto);
            if (JSON.stringify(nuevo) !== JSON.stringify(local)) {
              this.actividades[c.doc.id] = nuevo;
              hubo = true;
            }
          }
          if (hubo) this.nucleo.avisarAlumno(this.estado());
        },
        alError,
      ),
      onSnapshot(
        doc(db(), rutas.alumno(this.alumnoId)),
        async (s) => {
          const d = s.data() as DocAlumno | undefined;
          if (!d || s.metadata.hasPendingWrites) return;
          const cambioGrupo = d.grupo !== this.datos.grupo;
          this.datos = d;
          if (cambioGrupo) await this.cargarGrupo();
          this.nucleo.avisarAlumno(this.estado());
        },
        alError,
      ),
    );
    if (this.datos.grupo) {
      this.quitar.push(
        onSnapshot(
          doc(db(), rutas.grupo(this.datos.grupo)),
          (s) => {
            if (s.ref.id !== this.datos.grupo) return;
            this.grupo = aGrupo(s.ref.id, s.data() as DocGrupo | undefined);
            this.nucleo.avisarAlumno(this.estado());
          },
          alError,
        ),
      );
    }
  }

  /** Escribe sin esperar al servidor (la escritura queda en la cola local de Firestore). */
  escribir(ref: DocumentReference, datos: DocumentData) {
    this.nucleo.escritura(setDoc(ref, datos, { merge: true }));
  }

  // ------------------------------------------------------------ actividades

  abrir(id: string, codigoInicial: string): EstadoActividad {
    const previo = this.actividades[id];
    const e = progreso.abrirActividad(previo, codigoInicial);
    this.actividades[id] = e;
    if (!previo) {
      const { nota: _nota, ...inicial } = e;
      this.escribir(this.ref(id), inicial);
    }
    this.evento("actividad_abierta", id, {});
    return { ...e };
  }

  editar(id: string, lote: { t0: number; ops: LoteEdiciones["ops"] }, texto: string) {
    const actual = this.actividades[id] ?? progreso.estadoVacio();
    const r = progreso.guardarEdicion(actual, lote.ops as never, texto);
    if (lote.ops.length && r.estado !== actual) {
      this.actividades[id] = r.estado;
      let p = this.ediciones.get(id);
      if (!p) {
        p = { lotes: [] };
        // La primera vez en esta sesión (o tras reiniciar) se guarda el texto de partida.
        if (!this.conBase.has(id)) {
          p.base = actual.codigo;
          this.conBase.add(id);
        }
        this.ediciones.set(id, p);
      }
      p.lotes.push({ t0: lote.t0, ops: lote.ops });
      this.programarEdiciones();
      this.evento("edicion", id, { ops: lote.ops });
    }
    return r.resultado;
  }

  private programarEdiciones() {
    this.nucleo.recalcular();
    if (!this.tEdiciones) this.tEdiciones = setTimeout(() => this.vaciarEdiciones(), INTERVALO_EDICIONES_MS);
  }

  /** Pasa a Firestore las ediciones agrupadas (de una actividad o de todas). */
  vaciarEdiciones(soloId?: string) {
    const ids = soloId ? [soloId] : [...this.ediciones.keys()];
    for (const id of ids) {
      const p = this.ediciones.get(id);
      const e = this.actividades[id];
      if (!p || !e) continue;
      this.ediciones.delete(id);
      const datos: DocumentData = { codigo: e.codigo, actualizado: e.actualizado };
      const textos = p.lotes.map((l, i) => JSON.stringify(i === 0 && p.base !== undefined ? { ...l, base: p.base } : l));
      const tam = (this.tamanos.get(id) ?? 0) + textos.reduce((s, t) => s + t.length, 0);
      if (tam < LIMITE_EDICIONES) {
        datos.ediciones = arrayUnion(...textos);
        this.tamanos.set(id, tam);
      } else {
        datos.edicionesTruncadas = true;
      }
      this.escribir(this.ref(id), datos);
    }
    if (!this.ediciones.size && this.tEdiciones) {
      clearTimeout(this.tEdiciones);
      this.tEdiciones = null;
    }
    this.nucleo.recalcular();
  }

  reiniciar(id: string, codigoInicial: string): EstadoActividad {
    this.vaciarEdiciones(id);
    const e = progreso.reiniciarActividad(this.actividades[id], codigoInicial);
    this.actividades[id] = e;
    this.conBase.delete(id); // el siguiente lote de ediciones lleva el nuevo texto de partida
    this.escribir(this.ref(id), { codigo: e.codigo, actualizado: e.actualizado });
    return { ...e };
  }

  pruebas(id: string, pasadas: number, total: number, puntos: number): EstadoActividad {
    this.vaciarEdiciones(id);
    const antes = this.actividades[id] ?? progreso.estadoVacio();
    const e = progreso.registrarPruebas(antes, pasadas, total, puntos);
    this.actividades[id] = e;
    this.escribir(this.ref(id), {
      codigo: e.codigo,
      pasadas,
      total,
      intentos: increment(1),
      actualizado: e.actualizado,
      ...(e.completada && !antes.completada ? { completada: true, puntos: e.puntos } : {}),
    });
    this.evento("prueba", id, { pasadas, total });
    return { ...e };
  }

  respuesta(id: string, respuesta: string, correcta: boolean, puntos: number): EstadoActividad {
    const antes = this.actividades[id] ?? progreso.estadoVacio();
    const e = progreso.registrarRespuesta(antes, respuesta, correcta, puntos);
    this.actividades[id] = e;
    this.escribir(this.ref(id), {
      respuesta,
      intentos: increment(1),
      actualizado: e.actualizado,
      ...(e.completada && !antes.completada ? { completada: true, puntos: e.puntos } : {}),
    });
    this.evento("respuesta", id, { correcta });
    return { ...e };
  }

  pista(id: string, numero: number): EstadoActividad {
    const antes = this.actividades[id] ?? progreso.estadoVacio();
    const e = progreso.registrarPista(antes, numero);
    this.actividades[id] = e;
    if (e.pistas !== antes.pistas) this.escribir(this.ref(id), { pistas: e.pistas });
    this.evento("pista", id, { numero });
    return { ...e };
  }

  // ------------------------------------------------------------ contadores

  evento(tipo: string, actividad: string | null, datos: Record<string, unknown>) {
    const nuevo = contadoresVacios();
    progreso.sumarEvento(nuevo, tipo, datos);
    const delta: Delta = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => v));
    const t = this.cronometro.evento(Date.now(), tipo, actividad, datos);
    if (!Object.keys(delta).length && !t) return;
    const est = this.estadisticas;
    const sumar = (destino: Delta, d: Delta) => {
      for (const [k, v] of Object.entries(d) as [keyof Contadores, number][]) destino[k] = (destino[k] ?? 0) + v;
    };
    est.global = progreso.sumarContadores(est.global, delta);
    sumar(this.delta.global, delta);
    if (actividad && Object.keys(delta).length) {
      est.por_actividad[actividad] = progreso.sumarContadores(est.por_actividad[actividad] ?? contadoresVacios(), delta);
      sumar((this.delta.por_actividad[actividad] ??= {}), delta);
    }
    if (t) {
      const [a, ms] = t;
      est.global.tiempo_ms += ms;
      est.por_actividad[a] = progreso.sumarContadores(est.por_actividad[a] ?? contadoresVacios(), { tiempo_ms: ms });
      sumar(this.delta.global, { tiempo_ms: ms });
      sumar((this.delta.por_actividad[a] ??= {}), { tiempo_ms: ms });
    }
    this.hayDelta = true;
    this.nucleo.recalcular();
    if (!this.tContadores) this.tContadores = setTimeout(() => this.vaciarContadores(), INTERVALO_CONTADORES_MS);
  }

  vaciarContadores() {
    if (this.tContadores) clearTimeout(this.tContadores);
    this.tContadores = null;
    if (!this.hayDelta) return;
    const inc = (d: Delta) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, increment(v as number)]));
    const datos: DocumentData = {
      global: inc(this.delta.global),
      por_actividad: Object.fromEntries(Object.entries(this.delta.por_actividad).map(([k, d]) => [k, inc(d)])),
      actualizado: Date.now(),
    };
    this.delta = { global: {}, por_actividad: {} };
    this.hayDelta = false;
    this.escribir(doc(db(), rutas.contadores(this.alumnoId)), datos);
    this.nucleo.recalcular();
  }

  /** ¿Hay cambios agrupándose en memoria (aún no en la cola de Firestore)? */
  pendiente(): boolean {
    return this.ediciones.size > 0 || this.hayDelta;
  }

  vaciar() {
    this.vaciarEdiciones();
    this.vaciarContadores();
  }

  cerrar() {
    this.vaciar();
    this.quitar.forEach((f) => f());
    this.quitar = [];
  }
}

/** Núcleo para `iniciarApp`: login común, sesión del alumno y estado de sincronización. */
class NucleoFirebase {
  sesion: SesionAlumno | null = null;
  private oyentesSync = new Set<(e: EstadoSincronizacion) => void>();
  private oyentesAlumno = new Set<(e: EstadoAlumno) => void>();
  private enCola = 0;
  private generacion = 0;
  private ultimoSync: EstadoSincronizacion | null = null;
  private ultimaSyncEscrita = 0;

  constructor() {
    addEventListener("online", () => this.recalcular());
    addEventListener("offline", () => this.recalcular());
    // Al ocultar o cerrar la página, lo agrupado pasa a la cola persistente de Firestore.
    addEventListener("pagehide", () => this.sesion?.vaciar());
    document.addEventListener("visibilitychange", () => document.hidden && this.sesion?.vaciar());
  }

  /** Registra una escritura en curso (sin bloquear a nadie). */
  escritura(p: Promise<unknown>) {
    this.enCola++;
    const gen = ++this.generacion;
    p.catch((e) => console.warn("No se pudo guardar en la nube:", e));
    this.recalcular();
    waitForPendingWrites(db())
      .then(() => {
        if (gen !== this.generacion) return;
        this.enCola = 0;
        this.recalcular();
        this.marcarUltimaSync();
      })
      .catch(() => undefined);
  }

  private marcarUltimaSync(forzar = false) {
    const s = this.sesion;
    if (!s || !navigator.onLine) return;
    const ahora = Date.now();
    if (!forzar && ahora - this.ultimaSyncEscrita < INTERVALO_ULTIMA_SYNC_MS) return;
    this.ultimaSyncEscrita = ahora;
    // Sin pasar por `escritura`: no debe volver a disparar el indicador.
    updateDoc(doc(db(), rutas.alumno(s.alumnoId)), { ultimaSync: ahora }).catch(() => undefined);
  }

  recalcular() {
    let e: EstadoSincronizacion | null;
    if (!this.sesion) e = null;
    else if (!navigator.onLine) e = "sin-conexion";
    else if (this.enCola > 0 || this.sesion.pendiente()) e = "sincronizando";
    else e = "sincronizado";
    if (e === this.ultimoSync) return;
    this.ultimoSync = e;
    if (e) this.oyentesSync.forEach((f) => f(e));
    if (e === "sincronizado") this.marcarUltimaSync();
  }

  avisarAlumno(e: EstadoAlumno) {
    this.oyentesAlumno.forEach((f) => f(e));
  }

  async abrirSesion(s: SesionNube): Promise<SesionIniciada> {
    this.sesion?.cerrar();
    this.sesion = null;
    if (s.rol === "profesor") return { rol: "profesor" };
    const datos = await leerDoc<DocAlumno>(doc(db(), rutas.alumno(s.alumnoId)));
    if (!datos) throw new Error("No se encontraron tus datos. Conéctate a internet e inténtalo de nuevo.");
    const sesion = new SesionAlumno(s.alumnoId, datos, this);
    await sesion.cargar();
    this.sesion = sesion;
    sesion.escuchar();
    sesion.evento("sesion_inicio", null, {});
    this.ultimoSync = null;
    this.recalcular();
    this.marcarUltimaSync(true);
    return { rol: "alumno", estado: sesion.estado() };
  }

  s(): SesionAlumno {
    if (!this.sesion) throw new Error("No hay sesión iniciada.");
    return this.sesion;
  }

  backend(): Backend {
    return {
      estadoApp: async () => ({
        version: __VERSION_APP__,
        plataforma: "web",
        dev: import.meta.env.DEV,
        hay_profesor: await conLimite(hayProfesor(), ESPERA_LECTURA_MS).catch(() => null),
      }),
      reanudarSesion: async () => {
        const u = await sesionGuardada();
        if (!u) return null;
        return this.abrirSesion(await rolDeUsuario(u.uid));
      },
      iniciarSesion: async (usuario, clave) => this.abrirSesion(await iniciarSesionNube(usuario, clave)),
      configurarProfesor: async (correo, clave) => {
        await configurarProfesor(correo, clave);
      },
      cambiarContrasenaInicial: async (nueva) => {
        const s = this.s();
        await cambiarClaveInicial(s.alumnoId, nueva);
        s.datos = { ...s.datos, debeCambiarClave: false };
      },
      cambiarContrasena: (actual, nueva) => cambiarClave(actual, nueva),
      cerrarSesion: async () => {
        this.sesion?.cerrar();
        this.sesion = null;
        this.recalcular();
        await cerrarSesionAlumno();
      },
      estado: async () => this.s().estado(),
      estadisticas: async () => structuredClone(this.s().estadisticas),
      abrirActividad: async (id, inicial) => this.s().abrir(id, inicial),
      guardarEdicion: async (id, lote, texto) => this.s().editar(id, lote, texto),
      reiniciarActividad: async (id, inicial) => this.s().reiniciar(id, inicial),
      registrarPruebas: async (id, p, t, puntos) => this.s().pruebas(id, p, t, puntos),
      registrarRespuesta: async (id, r, c, puntos) => this.s().respuesta(id, r, c, puntos),
      registrarPista: async (id, n) => this.s().pista(id, n),
      registrarEvento: async (tipo, actividad, datos) => {
        if (this.sesion) this.sesion.evento(tipo, actividad, datos);
      },
      vaciar: async () => {
        this.sesion?.vaciar();
      },
      alSincronizar: (fn) => {
        this.oyentesSync.add(fn);
        if (this.ultimoSync) fn(this.ultimoSync);
        return () => this.oyentesSync.delete(fn);
      },
      alCambiarAlumno: (fn) => {
        this.oyentesAlumno.add(fn);
        return () => this.oyentesAlumno.delete(fn);
      },
    };
  }
}

export function crearBackendFirebase(): Backend {
  auth(); // inicializa Auth (restaura la sesión de IndexedDB) cuanto antes
  return new NucleoFirebase().backend();
}
