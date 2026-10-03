// Operaciones del profesor (app del profesor, etapa 3): configuración inicial, alta de alumnos,
// restablecer contraseñas, grupos y bajas. Las reglas (firestore.rules) solo las permiten al
// profesor registrado en config/app.

import { createUserWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { auth as authPorDefecto, crearAppSecundaria, db as dbPorDefecto } from "./firebase";
import {
  correoAlumno,
  generarContrasena,
  normalizarControl,
  POLITICAS_POR_DEFECTO,
  rutas,
  type ConfigApp,
  type DocAlumno,
  type DocGrupo,
  type DocLogin,
  type DocUsuario,
} from "./modelo";
import { mensajeAuth } from "./sesion";

export interface DependenciasProfesor {
  auth?: Auth;
  db?: Firestore;
  /** Auth aparte para crear cuentas sin cerrar la sesión del profesor (por defecto `crearAppSecundaria`). */
  authSecundaria?: () => { auth: Auth; cerrar: () => Promise<void> };
}

const A = (d?: DependenciasProfesor) => d?.auth ?? authPorDefecto();
const D = (d?: DependenciasProfesor) => d?.db ?? dbPorDefecto();
const S = (d?: DependenciasProfesor) => (d?.authSecundaria ?? crearAppSecundaria)();

/** config/app, o undefined si aún no hay profesor (legible sin sesión). */
export async function leerConfiguracion(deps?: DependenciasProfesor): Promise<ConfigApp | undefined> {
  return (await getDoc(doc(D(deps), rutas.config()))).data() as ConfigApp | undefined;
}

/**
 * Registra al usuario con sesión iniciada como EL profesor. Solo funciona una vez: las reglas
 * impiden crear config/app si ya existe.
 */
export async function reclamarProfesor(deps?: DependenciasProfesor): Promise<void> {
  const u = A(deps).currentUser;
  if (!u) throw new Error("Inicia sesión primero.");
  const cfg: ConfigApp = { profesorUid: u.uid, creado: Date.now(), ...(u.email ? { correo: u.email } : {}) };
  await setDoc(doc(D(deps), rutas.config()), cfg);
}

/**
 * Configuración inicial (una sola vez): crea la cuenta del profesor con su correo real, inicia
 * sesión con ella y escribe config/app. Si config/app ya existe, las reglas lo rechazan.
 */
export async function configurarProfesor(correo: string, clave: string, deps?: DependenciasProfesor): Promise<string> {
  if (clave.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  let uid: string;
  try {
    uid = (await createUserWithEmailAndPassword(A(deps), correo.trim(), clave)).user.uid;
  } catch (e) {
    throw new Error(mensajeAuth(e));
  }
  try {
    await reclamarProfesor(deps);
  } catch (e) {
    await signOut(A(deps)).catch(() => undefined);
    throw new Error(`Ya hay un profesor configurado (${(e as Error).message}).`);
  }
  return uid;
}

/** ¿El usuario con sesión iniciada es el profesor? */
export async function esProfesor(deps?: DependenciasProfesor): Promise<boolean> {
  const u = A(deps).currentUser;
  return !!u && (await leerConfiguracion(deps))?.profesorUid === u.uid;
}

export interface NuevoAlumno {
  control: string;
  nombre: string;
  grupo?: string | null;
  /** Contraseña temporal; por defecto una legible generada (`generarContrasena`). */
  clave?: string;
}

/** Lo que el profesor reparte a cada alumno. */
export interface Credenciales {
  alumnoId: string;
  control: string;
  nombre: string;
  correo: string;
  clave: string;
}

/** Busca un alumno por número de control. */
export async function buscarPorControl(
  control: string,
  deps?: DependenciasProfesor,
): Promise<{ id: string; datos: DocAlumno } | undefined> {
  const q = query(collection(D(deps), rutas.alumnos()), where("control", "==", normalizarControl(control)), limit(1));
  const r = await getDocs(q);
  const d = r.docs[0];
  return d ? { id: d.id, datos: d.data() as DocAlumno } : undefined;
}

/** Crea la cuenta de Auth (en la app secundaria) y devuelve su uid. */
async function crearCuenta(correo: string, clave: string, deps?: DependenciasProfesor): Promise<string> {
  const sec = S(deps);
  try {
    return (await createUserWithEmailAndPassword(sec.auth, correo, clave)).user.uid;
  } finally {
    await sec.cerrar().catch(() => undefined);
  }
}

/** Da de alta a un alumno: cuenta de Auth + alumnos/{id} + usuarios/{uid} + logins/{control}. */
export async function crearAlumno(nuevo: NuevoAlumno, deps?: DependenciasProfesor): Promise<Credenciales> {
  const control = normalizarControl(nuevo.control);
  const nombre = nuevo.nombre.trim();
  if (nombre.length < 3) throw new Error(`Falta el nombre del alumno ${control}.`);
  if (await buscarPorControl(control, deps)) throw new Error(`Ya existe un alumno con el número de control ${control}.`);
  const clave = nuevo.clave ?? generarContrasena();
  const db = D(deps);
  // Si el correo base ya tiene cuenta (p. ej. un alumno dado de baja), usa el siguiente alias.
  let n = 0;
  let uid = "";
  let correo = "";
  for (; n < 20; n++) {
    correo = correoAlumno(control, n);
    try {
      uid = await crearCuenta(correo, clave, deps);
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/email-already-in-use") throw new Error(mensajeAuth(e));
    }
  }
  if (!uid) throw new Error(`No se pudo crear la cuenta de ${control}.`);
  const alumnoRef = doc(collection(db, rutas.alumnos()));
  const alumno: DocAlumno = {
    nombre,
    control,
    grupo: nuevo.grupo ?? null,
    uidActual: uid,
    correo,
    alias: [],
    debeCambiarClave: true,
    creado: Date.now(),
    ultimaSync: null,
  };
  const lote = writeBatch(db);
  lote.set(alumnoRef, alumno);
  lote.set(doc(db, rutas.usuario(uid)), { alumnoId: alumnoRef.id } satisfies DocUsuario);
  lote.set(doc(db, rutas.login(control)), { correo } satisfies DocLogin);
  await lote.commit();
  return { alumnoId: alumnoRef.id, control, nombre, correo, clave };
}

/**
 * "Restablecer" la contraseña en el plan Spark (sin Admin SDK): crea una cuenta nueva
 * `<control>+r{n}@…`, la liga al mismo alumnoId y desliga la anterior. El progreso no se mueve.
 */
export async function restablecerAlumno(
  alumnoId: string,
  deps?: DependenciasProfesor & { clave?: string },
): Promise<Credenciales> {
  const db = D(deps);
  const snap = await getDoc(doc(db, rutas.alumno(alumnoId)));
  const a = snap.data() as DocAlumno | undefined;
  if (!a) throw new Error("El alumno no existe.");
  const clave = deps?.clave ?? generarContrasena();
  let n = a.alias.length + 1;
  let uid = "";
  let correo = "";
  for (let intentos = 0; intentos < 20; intentos++, n++) {
    correo = correoAlumno(a.control, n);
    try {
      uid = await crearCuenta(correo, clave, deps);
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== "auth/email-already-in-use") throw new Error(mensajeAuth(e));
    }
  }
  if (!uid) throw new Error(`No se pudo crear la cuenta nueva de ${a.control}.`);
  const lote = writeBatch(db);
  lote.set(doc(db, rutas.usuario(uid)), { alumnoId } satisfies DocUsuario);
  if (a.uidActual && a.uidActual !== uid) lote.delete(doc(db, rutas.usuario(a.uidActual)));
  lote.update(doc(db, rutas.alumno(alumnoId)), {
    uidActual: uid,
    correo,
    alias: arrayUnion(a.correo),
    debeCambiarClave: true,
  });
  lote.set(doc(db, rutas.login(a.control)), { correo } satisfies DocLogin);
  await lote.commit();
  return { alumnoId, control: a.control, nombre: a.nombre, correo, clave };
}

/** Cambia nombre o grupo de un alumno. */
export async function actualizarAlumno(
  alumnoId: string,
  cambios: Partial<Pick<DocAlumno, "nombre" | "grupo">>,
  deps?: DependenciasProfesor,
): Promise<void> {
  const lote = writeBatch(D(deps));
  lote.update(doc(D(deps), rutas.alumno(alumnoId)), cambios);
  await lote.commit();
}

/**
 * Da de baja a un alumno: borra su progreso, usuarios/{uid}, logins/{control} y alumnos/{id}.
 * La cuenta de Auth queda (desde el navegador no se puede borrar otra cuenta), pero ya no da acceso.
 */
export async function eliminarAlumno(alumnoId: string, deps?: DependenciasProfesor): Promise<void> {
  const db = D(deps);
  const a = (await getDoc(doc(db, rutas.alumno(alumnoId)))).data() as DocAlumno | undefined;
  const docs = [
    ...(await getDocs(collection(db, rutas.actividades(alumnoId)))).docs.map((d) => d.ref),
    doc(db, rutas.contadores(alumnoId)),
  ];
  for (let i = 0; i < docs.length; i += 450) {
    const lote = writeBatch(db);
    for (const r of docs.slice(i, i + 450)) lote.delete(r);
    await lote.commit();
  }
  const lote = writeBatch(db);
  if (a?.uidActual) lote.delete(doc(db, rutas.usuario(a.uidActual)));
  if (a?.control) lote.delete(doc(db, rutas.login(a.control)));
  lote.delete(doc(db, rutas.alumno(alumnoId)));
  await lote.commit();
}

/** Crea (sin id) o actualiza un grupo; devuelve su id. */
export async function guardarGrupo(
  grupoId: string | null,
  datos: Partial<DocGrupo> & { nombre: string },
  deps?: DependenciasProfesor,
): Promise<string> {
  const db = D(deps);
  const ref = grupoId ? doc(db, rutas.grupo(grupoId)) : doc(collection(db, rutas.grupos()));
  const grupo: DocGrupo = {
    creado: Date.now(),
    ...datos,
    politicas: { ...POLITICAS_POR_DEFECTO, ...datos.politicas },
  };
  await setDoc(ref, grupo, { merge: true });
  return ref.id;
}
