// Cliente Firebase compartido. Todo se inicializa de forma perezosa (al primer uso) para que las
// pruebas y las vistas que no tocan la nube no carguen Firebase.
//  - Auth guarda la sesión en IndexedDB (con localStorage de respaldo): una vez iniciada, la app
//    funciona sin red.
//  - Firestore usa la caché persistente con varias pestañas: lecturas sin conexión y cola de
//    escrituras que se envía sola al volver la red.

import { deleteApp, getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

// `?? {}`: fuera de Vite (Node, Playwright) import.meta.env no existe.
const env: Partial<ImportMetaEnv> = import.meta.env ?? {};

/** ¿Usar los emuladores locales (VITE_FIREBASE_EMULATOR=1)? */
export const usaEmulador = env.VITE_FIREBASE_EMULATOR === "1";

export function configuracionFirebase(): FirebaseOptions {
  const cfg: FirebaseOptions = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  if (usaEmulador) {
    // Los emuladores aceptan cualquier llave; solo hace falta un projectId.
    cfg.apiKey ||= "emulador";
    cfg.projectId ||= "demo-rlp";
    cfg.authDomain ||= "localhost";
  }
  if (!cfg.apiKey || !cfg.projectId) {
    throw new Error("Falta la configuración de Firebase (VITE_FIREBASE_API_KEY y VITE_FIREBASE_PROJECT_ID; ver apps/alumno-web/.env.example y docs/INSTALACION.md).");
  }
  return cfg;
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

/** App principal de Firebase (se crea al primer uso). */
export function app(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(configuracionFirebase());
  return _app;
}

/** Auth con la sesión persistida en IndexedDB (respaldo: localStorage). */
export function auth(): Auth {
  if (!_auth) {
    _auth = initializeAuth(app(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    if (usaEmulador) connectAuthEmulator(_auth, "http://localhost:9099", { disableWarnings: true });
  }
  return _auth;
}

/** Firestore con caché persistente compartida entre pestañas (funciona sin conexión). */
export function db(): Firestore {
  if (!_db) {
    _db = initializeFirestore(app(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (usaEmulador) connectFirestoreEmulator(_db, "localhost", 8080);
  }
  return _db;
}

let secundarias = 0;

/**
 * App y Auth secundarios (en memoria, sin persistencia) para que el profesor cree cuentas de
 * alumnos con `createUserWithEmailAndPassword` sin cerrar su propia sesión. Llama a `cerrar()` al
 * terminar.
 */
export function crearAppSecundaria(): { app: FirebaseApp; auth: Auth; cerrar: () => Promise<void> } {
  const nombre = `secundaria-${++secundarias}`;
  const secundaria = initializeApp(configuracionFirebase(), nombre);
  const authSec = initializeAuth(secundaria, { persistence: inMemoryPersistence });
  if (usaEmulador) connectAuthEmulator(authSec, "http://localhost:9099", { disableWarnings: true });
  return { app: secundaria, auth: authSec, cerrar: () => deleteApp(secundaria) };
}
