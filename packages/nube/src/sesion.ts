// Inicio de sesión del alumno con su número de control.
//
// El número de control se traduce al correo sintético vigente: `logins/{control}` (legible sin
// sesión; lo escribe el profesor al crear o restablecer la cuenta) y, si no existe o no se puede
// leer, `correoAlumno(control)`. Luego `usuarios/{uid}` da el `alumnoId` estable.

import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDoc, getDocFromCache, getDocFromServer, updateDoc, type Firestore } from "firebase/firestore";
import { auth as authPorDefecto, db as dbPorDefecto } from "./firebase";
import { correoAlumno, rutas, type ConfigApp, type DocAlumno, type DocLogin, type DocUsuario } from "./modelo";

/** Instancias a usar; por defecto las de la app principal (`auth()`, `db()`). */
export interface Dependencias {
  auth?: Auth;
  db?: Firestore;
}

const A = (d?: Dependencias) => d?.auth ?? authPorDefecto();
const D = (d?: Dependencias) => d?.db ?? dbPorDefecto();

export interface SesionAlumno {
  uid: string;
  alumnoId: string;
}

/** Correo de acceso vigente para un número de control. Requiere conexión (si no, el correo base). */
export async function correoDeLogin(control: string, deps?: Dependencias): Promise<string> {
  const base = correoAlumno(control);
  try {
    const s = await getDocFromServer(doc(D(deps), rutas.login(control)));
    return (s.data() as DocLogin | undefined)?.correo || base;
  } catch {
    return base;
  }
}

/** Lee un documento; si no hay red (o el servidor no responde) usa la caché local. */
export async function leerDoc<T>(db: Firestore, ruta: string): Promise<T | undefined> {
  try {
    return (await getDoc(doc(db, ruta))).data() as T | undefined;
  } catch {
    try {
      return (await getDocFromCache(doc(db, ruta))).data() as T | undefined;
    } catch {
      return undefined;
    }
  }
}

/** Busca el alumnoId de la cuenta (usuarios/{uid}). Con sesión persistida funciona sin red (caché). */
export async function alumnoDeUsuario(uid: string, deps?: Dependencias): Promise<string> {
  const u = await leerDoc<DocUsuario>(D(deps), rutas.usuario(uid));
  if (!u?.alumnoId) throw new Error("Esta cuenta no corresponde a ningún alumno. Pide ayuda a tu profesor.");
  return u.alumnoId;
}

const ERRORES_AUTH: Record<string, string> = {
  "auth/invalid-credential": "Número de control o contraseña incorrectos.",
  "auth/wrong-password": "Número de control o contraseña incorrectos.",
  "auth/user-not-found": "Número de control o contraseña incorrectos.",
  "auth/invalid-email": "Número de control no válido.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/network-request-failed": "Sin conexión. La primera vez necesitas internet para entrar.",
  "auth/user-disabled": "Tu cuenta está desactivada. Habla con tu profesor.",
  "auth/weak-password": "La contraseña es muy débil: usa al menos 8 caracteres.",
  "auth/requires-recent-login": "Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña.",
};

/** Traduce un error de Firebase Auth a un mensaje para el alumno. */
export function mensajeAuth(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? "";
  return ERRORES_AUTH[codigo] ?? (e instanceof Error ? e.message : String(e));
}

/** Inicia sesión con número de control y contraseña. Necesita conexión. */
export async function iniciarSesionAlumno(control: string, clave: string, deps?: Dependencias): Promise<SesionAlumno> {
  const correo = await correoDeLogin(control, deps);
  let usuario: User;
  try {
    usuario = (await signInWithEmailAndPassword(A(deps), correo, clave)).user;
  } catch (e) {
    throw new Error(mensajeAuth(e));
  }
  try {
    return { uid: usuario.uid, alumnoId: await alumnoDeUsuario(usuario.uid, deps) };
  } catch (e) {
    await signOut(A(deps)).catch(() => undefined);
    throw e;
  }
}

/** Sesión guardada en este navegador (IndexedDB), si la hay. Funciona sin red. */
export function sesionGuardada(deps?: Dependencias): Promise<User | null> {
  const a = A(deps);
  return new Promise((resolver) => {
    const quitar = onAuthStateChanged(a, (u) => {
      quitar();
      resolver(u);
    });
  });
}

/** Lee el documento del alumno (servidor si hay red; si no, caché). */
export function leerAlumno(alumnoId: string, deps?: Dependencias): Promise<DocAlumno | undefined> {
  return leerDoc<DocAlumno>(D(deps), rutas.alumno(alumnoId));
}

/**
 * Cambio de contraseña obligatorio del primer acceso: `updatePassword` y luego
 * `debeCambiarClave = false`. Necesita conexión.
 */
export async function cambiarClaveInicial(alumnoId: string, nueva: string, deps?: Dependencias): Promise<void> {
  const usuario = A(deps).currentUser;
  if (!usuario) throw new Error("No hay sesión iniciada.");
  if (nueva.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  try {
    await updatePassword(usuario, nueva);
  } catch (e) {
    throw new Error(mensajeAuth(e));
  }
  // La escritura queda en la cola local; no se espera más de unos segundos la confirmación.
  const escritura = updateDoc(doc(D(deps), rutas.alumno(alumnoId)), { debeCambiarClave: false });
  await Promise.race([escritura, new Promise((r) => setTimeout(r, 5000))]);
}

/** Cambio de contraseña voluntario (pide la actual). Necesita conexión. */
export async function cambiarClave(actual: string, nueva: string, deps?: Dependencias): Promise<void> {
  const usuario = A(deps).currentUser;
  if (!usuario?.email) throw new Error("No hay sesión iniciada.");
  if (nueva.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  try {
    await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(usuario.email, actual));
    await updatePassword(usuario, nueva);
  } catch (e) {
    throw new Error(mensajeAuth(e));
  }
}

export async function cerrarSesionAlumno(deps?: Dependencias): Promise<void> {
  await signOut(A(deps));
}

// ---------------------------------------------------------------- login común (alumno o profesor)

export type Rol = "alumno" | "profesor";

export type SesionIniciada = { rol: "profesor"; uid: string } | ({ rol: "alumno" } & SesionAlumno);

/** ¿Este uid es el del profesor (config/app.profesorUid)? Usa la caché si no hay red. */
export async function esUidProfesor(uid: string, deps?: Dependencias): Promise<boolean> {
  const cfg = await leerDoc<ConfigApp>(D(deps), rutas.config());
  return cfg?.profesorUid === uid;
}

/** ¿Ya se configuró el profesor? (config/app existe). `null` si no se pudo saber (sin red ni caché). */
export async function hayProfesor(deps?: Dependencias): Promise<boolean | null> {
  try {
    return (await getDoc(doc(D(deps), rutas.config()))).exists();
  } catch {
    try {
      return (await getDocFromCache(doc(D(deps), rutas.config()))).exists();
    } catch {
      return null;
    }
  }
}

/** Rol de una sesión ya iniciada (o restaurada de IndexedDB). */
export async function rolDeUsuario(uid: string, deps?: Dependencias): Promise<SesionIniciada> {
  if (await esUidProfesor(uid, deps)) return { rol: "profesor", uid };
  return { rol: "alumno", uid, alumnoId: await alumnoDeUsuario(uid, deps) };
}

/**
 * Login de la pantalla común: un identificador con "@" es el correo del profesor; si no, es un
 * número de control de alumno.
 */
export async function iniciarSesion(identificador: string, clave: string, deps?: Dependencias): Promise<SesionIniciada> {
  const id = identificador.trim();
  if (!id.includes("@")) return { rol: "alumno", ...(await iniciarSesionAlumno(id, clave, deps)) };
  let usuario: User;
  try {
    usuario = (await signInWithEmailAndPassword(A(deps), id, clave)).user;
  } catch (e) {
    throw new Error(mensajeAuth(e).replace("Número de control", "Correo"));
  }
  try {
    return await rolDeUsuario(usuario.uid, deps);
  } catch (e) {
    await signOut(A(deps)).catch(() => undefined);
    throw e;
  }
}
