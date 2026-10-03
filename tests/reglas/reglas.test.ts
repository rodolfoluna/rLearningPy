// Reglas de Firestore (firestore.rules) con @firebase/rules-unit-testing.
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

const PROFESOR = "uid-profesor";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rlp",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** Datos base: profesor, dos alumnos (ana en el grupo g1, beto en g2) y sus cuentas. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "config/app"), { profesorUid: PROFESOR, creado: 1 });
    for (const [id, uid, grupo] of [
      ["ana", "uid-ana", "g1"],
      ["beto", "uid-beto", "g2"],
    ]) {
      await setDoc(doc(db, `alumnos/${id}`), {
        nombre: id,
        control: id,
        grupo,
        uidActual: uid,
        correo: `${id}@alumnos.rlp.local`,
        alias: [],
        debeCambiarClave: true,
        creado: 1,
        ultimaSync: null,
      });
      await setDoc(doc(db, `usuarios/${uid}`), { alumnoId: id });
      await setDoc(doc(db, `alumnos/${id}/actividades/a1`), { codigo: "x", completada: false });
      await setDoc(doc(db, `logins/${id}`), { correo: `${id}@alumnos.rlp.local` });
      await setDoc(doc(db, `grupos/${grupo}`), { nombre: grupo, politicas: { pegado: "bloquear" } });
    }
  });
});

const alumno = (uid: string) => env.authenticatedContext(uid).firestore();
const profesor = () => env.authenticatedContext(PROFESOR).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

describe("alumnos", () => {
  it("un alumno lee y escribe su propio progreso", async () => {
    const db = alumno("uid-ana");
    await assertSucceeds(getDoc(doc(db, "alumnos/ana")));
    await assertSucceeds(getDoc(doc(db, "alumnos/ana/actividades/a1")));
    await assertSucceeds(getDocs(collection(db, "alumnos/ana/actividades")));
    await assertSucceeds(setDoc(doc(db, "alumnos/ana/actividades/a2"), { codigo: "print(1)" }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, "alumnos/ana/resumen/contadores"), { global: { copias: 1 } }, { merge: true }));
  });

  it("un alumno no puede leer ni escribir a otro", async () => {
    const db = alumno("uid-ana");
    await assertFails(getDoc(doc(db, "alumnos/beto")));
    await assertFails(getDoc(doc(db, "alumnos/beto/actividades/a1")));
    await assertFails(getDocs(collection(db, "alumnos/beto/actividades")));
    await assertFails(setDoc(doc(db, "alumnos/beto/actividades/a1"), { completada: true }, { merge: true }));
    await assertFails(getDoc(doc(db, "usuarios/uid-beto")));
    await assertFails(getDocs(collection(db, "alumnos")));
    await assertFails(getDocs(collectionGroup(db, "actividades")));
  });

  it("el alumno no puede cambiar su grupo, nombre ni uidActual", async () => {
    const db = alumno("uid-ana");
    await assertFails(updateDoc(doc(db, "alumnos/ana"), { grupo: "g2" }));
    await assertFails(updateDoc(doc(db, "alumnos/ana"), { nombre: "Otra" }));
    await assertFails(updateDoc(doc(db, "alumnos/ana"), { uidActual: "uid-x" }));
    await assertFails(updateDoc(doc(db, "alumnos/ana"), { debeCambiarClave: false, grupo: "g2" }));
    await assertFails(deleteDoc(doc(db, "alumnos/ana")));
  });

  it("el alumno solo puede quitar debeCambiarClave y marcar ultimaSync", async () => {
    const db = alumno("uid-ana");
    await assertSucceeds(updateDoc(doc(db, "alumnos/ana"), { ultimaSync: 123 }));
    await assertSucceeds(updateDoc(doc(db, "alumnos/ana"), { debeCambiarClave: false }));
    await assertFails(updateDoc(doc(db, "alumnos/ana"), { debeCambiarClave: true }));
  });

  it("el alumno lee su usuario y su grupo, no otros; no escribe usuarios ni grupos", async () => {
    const db = alumno("uid-ana");
    await assertSucceeds(getDoc(doc(db, "usuarios/uid-ana")));
    await assertSucceeds(getDoc(doc(db, "grupos/g1")));
    await assertFails(getDoc(doc(db, "grupos/g2")));
    await assertFails(setDoc(doc(db, "usuarios/uid-ana"), { alumnoId: "beto" }));
    await assertFails(setDoc(doc(db, "grupos/g1"), { nombre: "x", politicas: { pegado: "propio" } }));
  });

  it("una cuenta sin usuarios/{uid} no lee nada de alumnos", async () => {
    const db = alumno("uid-desconocido");
    await assertFails(getDoc(doc(db, "alumnos/ana")));
    await assertFails(getDoc(doc(db, "grupos/g1")));
  });

  it("logins es legible sin sesión pero solo el profesor lo escribe", async () => {
    await assertSucceeds(getDoc(doc(anonimo(), "logins/ana")));
    await assertFails(setDoc(doc(anonimo(), "logins/ana"), { correo: "x@y" }));
    await assertFails(setDoc(doc(alumno("uid-ana"), "logins/ana"), { correo: "x@y" }));
    await assertSucceeds(setDoc(doc(profesor(), "logins/ana"), { correo: "ana+r1@alumnos.rlp.local" }));
  });

  it("sin sesión no se lee ningún alumno", async () => {
    await assertFails(getDoc(doc(anonimo(), "alumnos/ana")));
    await assertFails(getDoc(doc(anonimo(), "usuarios/uid-ana")));
  });
});

describe("profesor", () => {
  it("el profesor lee y escribe todo", async () => {
    const db = profesor();
    await assertSucceeds(getDocs(collection(db, "alumnos")));
    await assertSucceeds(getDocs(collectionGroup(db, "actividades")));
    await assertSucceeds(getDoc(doc(db, "alumnos/beto/actividades/a1")));
    await assertSucceeds(updateDoc(doc(db, "alumnos/ana"), { grupo: "g2", nombre: "Ana María" }));
    await assertSucceeds(setDoc(doc(db, "usuarios/uid-nuevo"), { alumnoId: "ana" }));
    await assertSucceeds(deleteDoc(doc(db, "usuarios/uid-ana")));
    await assertSucceeds(setDoc(doc(db, "grupos/g3"), { nombre: "g3", politicas: { pegado: "propio" } }));
    await assertSucceeds(setDoc(doc(db, "alumnos/nuevo"), { nombre: "n", control: "n" }));
    await assertSucceeds(deleteDoc(doc(db, "alumnos/nuevo")));
  });

  it("solo hay un profesor: nadie más puede crear ni cambiar config/app", async () => {
    await assertFails(setDoc(doc(alumno("uid-ana"), "config/app"), { profesorUid: "uid-ana", creado: 2 }));
    await assertFails(setDoc(doc(alumno("uid-intruso"), "config/app"), { profesorUid: "uid-intruso", creado: 2 }));
    await assertFails(setDoc(doc(profesor(), "config/app"), { profesorUid: "uid-otro", creado: 2 }));
    await assertFails(deleteDoc(doc(profesor(), "config/app")));
    await assertSucceeds(getDoc(doc(anonimo(), "config/app")));
  });

  it("config/app se crea una sola vez y solo con el propio uid", async () => {
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), "config/app")));
    await assertFails(setDoc(doc(anonimo(), "config/app"), { profesorUid: "x", creado: 1 }));
    await assertFails(setDoc(doc(alumno("uid-p2"), "config/app"), { profesorUid: "otro", creado: 1 }));
    await assertSucceeds(setDoc(doc(alumno("uid-p2"), "config/app"), { profesorUid: "uid-p2", creado: 1 }));
    await assertFails(setDoc(doc(alumno("uid-p3"), "config/app"), { profesorUid: "uid-p3", creado: 1 }));
  });
});
