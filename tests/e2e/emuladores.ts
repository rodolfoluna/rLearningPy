// Ayudas para las pruebas e2e contra los emuladores de Firebase (Auth 9099, Firestore 8080):
// limpiar los datos y preparar profesor, grupo y alumno con @rlp/nube desde Node; servir el sitio
// compilado como en GitHub Pages.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve } from "node:path";
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

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".zip": "application/zip",
};

/**
 * Sirve apps/alumno-web/dist como lo haría GitHub Pages de proyecto: archivos estáticos bajo
 * una subcarpeta (`/rlp/`) y sin encabezados COOP/COEP.
 */
export async function servirDist(dist: string, prefijo = "/rlp/"): Promise<{ base: string; servidor: Server; cerrar: () => Promise<void> }> {
  const servidor = createServer((pedido, respuesta) => {
    const ruta = decodeURIComponent(new URL(pedido.url ?? "/", "http://x").pathname);
    let archivo = resolve(dist, "." + ruta.slice(prefijo.length - 1));
    if (!ruta.startsWith(prefijo) || !archivo.startsWith(dist)) return void respuesta.writeHead(404).end();
    if (existsSync(archivo) && statSync(archivo).isDirectory()) archivo = join(archivo, "index.html");
    if (!existsSync(archivo)) return void respuesta.writeHead(404).end();
    respuesta.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
    respuesta.end(readFileSync(archivo));
  });
  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
  return {
    base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}${prefijo}`,
    servidor,
    cerrar: async () => {
      if (!servidor.listening) return;
      servidor.closeAllConnections();
      await new Promise((listo) => servidor.close(listo));
    },
  };
}
