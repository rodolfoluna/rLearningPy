// Flujo completo de cuentas con @rlp/nube contra los emuladores (Auth + Firestore, con reglas):
// configurar profesor → grupo → alta de alumno → login con número de control → cambio de
// contraseña obligatorio → restablecer → login del profesor desde la pantalla común.
import {
  configurarProfesor,
  crearAlumno,
  guardarGrupo,
  hayProfesor,
  iniciarSesion,
  cambiarClaveInicial,
  restablecerAlumno,
  rutas,
  type DocAlumno,
} from "@rlp/nube";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signOut, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  initializeFirestore,
  memoryLocalCache,
  setDoc,
  terminate,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROYECTO = "demo-rlp";
let n = 0;
const apps: { app: FirebaseApp; db: Firestore }[] = [];

function instancia(): { auth: Auth; db: Firestore } {
  const app = initializeApp({ apiKey: "emulador", projectId: PROYECTO, authDomain: "localhost" }, `prueba-${++n}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  apps.push({ app, db });
  return { auth, db };
}

const secundaria = () => {
  const app = initializeApp({ apiKey: "emulador", projectId: PROYECTO, authDomain: "localhost" }, `sec-${++n}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  return { auth, cerrar: () => deleteApp(app) };
};

beforeAll(async () => {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROYECTO}/accounts`, { method: "DELETE" });
});

afterAll(async () => {
  for (const a of apps) {
    await terminate(a.db).catch(() => undefined);
    await deleteApp(a.app).catch(() => undefined);
  }
});

describe("cuentas de profesor y alumnos", () => {
  it("flujo completo", async () => {
    const profe = { ...instancia(), authSecundaria: secundaria };
    expect(await hayProfesor(profe)).toBe(false);
    await configurarProfesor("profe@escuela.mx", "profe-12345", profe);
    expect(await hayProfesor(profe)).toBe(true);

    // Un segundo "profesor" no puede tomar el control.
    const intruso = instancia();
    await expect(configurarProfesor("otro@escuela.mx", "otro-12345", intruso)).rejects.toThrow(/Ya hay un profesor/);

    const grupo = await guardarGrupo(null, { nombre: "1A", politicas: { pegado: "propio" } }, profe);
    const cred = await crearAlumno({ control: " 21340500 ", nombre: "Karla Pérez", grupo }, profe);
    expect(cred.correo).toBe("21340500@alumnos.rlp.local");
    expect(cred.clave).toMatch(/^[a-z-]+-\d{4}$/);
    expect(cred.clave.length).toBeGreaterThanOrEqual(8);
    await expect(crearAlumno({ control: "21340500", nombre: "Repetido" }, profe)).rejects.toThrow(/Ya existe/);

    // El alumno entra con su número de control (otra instancia, como otro navegador).
    const alu = instancia();
    const s = await iniciarSesion("21340500", cred.clave, alu);
    expect(s).toEqual({ rol: "alumno", uid: expect.any(String), alumnoId: cred.alumnoId });
    const leer = async (db: Firestore) => (await getDoc(doc(db, rutas.alumno(cred.alumnoId)))).data() as DocAlumno;
    expect((await leer(alu.db)).debeCambiarClave).toBe(true);
    expect((await getDoc(doc(alu.db, rutas.grupo(grupo)))).data()?.politicas.pegado).toBe("propio");
    await cambiarClaveInicial(cred.alumnoId, "mi-clave-nueva", alu);
    expect((await leer(alu.db)).debeCambiarClave).toBe(false);
    await setDoc(doc(alu.db, rutas.actividad(cred.alumnoId, "u0-hola")), { codigo: "print(1)", completada: true }, { merge: true });
    await expect(iniciarSesion("21340500", "contraseña-mala", instancia())).rejects.toThrow(/incorrectos/);
    await signOut(alu.auth);

    // Restablecer: cuenta nueva +r1 ligada al mismo alumnoId; el progreso sigue ahí.
    const nueva = await restablecerAlumno(cred.alumnoId, profe);
    expect(nueva.correo).toBe("21340500+r1@alumnos.rlp.local");
    const a = await leer(profe.db);
    expect(a).toMatchObject({ correo: nueva.correo, alias: [cred.correo], debeCambiarClave: true });
    const otra = instancia();
    await expect(iniciarSesion("21340500", "mi-clave-nueva", otra)).rejects.toThrow();
    const s2 = await iniciarSesion("21340500", nueva.clave, otra);
    expect(s2).toMatchObject({ rol: "alumno", alumnoId: cred.alumnoId });
    expect((await getDoc(doc(otra.db, rutas.actividad(cred.alumnoId, "u0-hola")))).data()?.completada).toBe(true);

    // El profesor entra desde la misma pantalla, con su correo.
    const p2 = instancia();
    expect(await iniciarSesion("profe@escuela.mx", "profe-12345", p2)).toMatchObject({ rol: "profesor" });
  });
});
