// Ayudas para las pruebas e2e contra los emuladores de Firebase (Auth 9099, Firestore 8080):
// limpiar los datos y preparar profesor, grupo y alumno con @rlp/nube desde Node.
import { configurarProfesor, crearAlumno, guardarGrupo, type Credenciales } from "@rlp/nube";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate, type Firestore } from "firebase/firestore";

export const PROYECTO = "demo-rlp";
let n = 0;

/** ¿Están corriendo los emuladores? */
export async function hayEmuladores(): Promise<boolean> {
  try {
    await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(2000) });
    await fetch("http://127.0.0.1:9099/", { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

export async function limpiarEmuladores() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROYECTO}/accounts`, { method: "DELETE" });
}

function crearAuth(nombre: string) {
  const app = initializeApp({ apiKey: "emulador", projectId: PROYECTO, authDomain: "localhost" }, nombre);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  return { app, auth };
}

export interface Profesor {
  auth: Auth;
  db: Firestore;
  cerrar: () => Promise<void>;
}

/** Instancia de Firebase en Node con la sesión del profesor (lo configura si hace falta). */
export async function profesor(correo = "profe@escuela.mx", clave = "profe-12345"): Promise<Profesor> {
  const { app, auth } = crearAuth(`e2e-profesor-${++n}`);
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  await configurarProfesor(correo, clave, { auth, db });
  return {
    auth,
    db,
    cerrar: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

/** Crea un grupo y un alumno; devuelve sus credenciales (contraseña temporal). */
export async function alumnoNuevo(p: Profesor, control: string, nombre: string): Promise<Credenciales> {
  const deps = {
    auth: p.auth,
    db: p.db,
    authSecundaria: () => {
      const s = crearAuth(`e2e-sec-${++n}`);
      return { auth: s.auth, cerrar: () => deleteApp(s.app) };
    },
  };
  const grupo = await guardarGrupo(null, { nombre: "1A", politicas: { pegado: "bloquear" } }, deps);
  return crearAlumno({ control, nombre, grupo }, deps);
}
