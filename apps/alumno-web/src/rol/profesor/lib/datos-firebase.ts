// Datos del profesor en Firestore.
//
// Cuota de lecturas (plan Spark: 50 000/día). El tablero escucha:
//  - `alumnos` (un documento por alumno) y
//  - `collectionGroup("resumen")` (un documento por alumno con contadores, avance y notas).
// Abrirlo cuesta ~2 lecturas por alumno (70 con 35 alumnos) y después solo se cobra lo que
// cambia (cada alumno activo envía su resumen a lo más una vez por minuto). Las actividades
// (código e historial) se leen una por una solo al abrirlas en el detalle.

import {
  actualizarAlumno,
  auth,
  calificar,
  COLECCION_RESUMEN,
  contadoresVacios,
  crearAlumno,
  db,
  eliminarAlumno,
  eliminarGrupo,
  guardarGrupo,
  POLITICAS_POR_DEFECTO,
  restablecerAlumno,
  rutas,
  type DocActividad,
  type DocAlumno,
  type DocContadores,
  type DocGrupo,
} from "@rlp/nube";
import { collection, collectionGroup, doc, onSnapshot } from "firebase/firestore";
import type { DatosProfesor } from "./datos";
import type { AlumnoFila, Grupo } from "./tipos";

/** Une el documento del alumno con su resumen. */
export function filaDeAlumno(id: string, a: DocAlumno, r: Partial<DocContadores> | undefined): AlumnoFila {
  const vacio = contadoresVacios();
  return {
    id,
    nombre: a.nombre,
    control: a.control,
    grupo: a.grupo ?? null,
    correo: a.correo,
    debeCambiarClave: !!a.debeCambiarClave,
    creado: a.creado ?? 0,
    ultimaSync: Math.max(a.ultimaSync ?? 0, r?.actualizado ?? 0) || null,
    conDatosMoviles: a.redUltimaSync === "celular",
    global: { ...vacio, ...r?.global },
    porActividad: Object.fromEntries(Object.entries(r?.por_actividad ?? {}).map(([k, v]) => [k, { ...vacio, ...v }])),
    avance: r?.avance ?? {},
    notas: r?.notas ?? {},
  };
}

export function crearDatosFirebase(): DatosProfesor {
  return {
    correo: () => auth().currentUser?.email ?? null,

    escucharAlumnos(alCambiar, alError) {
      const alumnos = new Map<string, DocAlumno>();
      const resumenes = new Map<string, Partial<DocContadores>>();
      let listos = 0;
      const emitir = () => {
        if (listos !== 3) return; // espera la primera respuesta de ambas consultas
        alCambiar(
          [...alumnos].map(([id, a]) => filaDeAlumno(id, a, resumenes.get(id))).sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
        );
      };
      const quitarAlumnos = onSnapshot(
        collection(db(), rutas.alumnos()),
        (s) => {
          for (const c of s.docChanges()) {
            if (c.type === "removed") alumnos.delete(c.doc.id);
            else alumnos.set(c.doc.id, c.doc.data() as DocAlumno);
          }
          listos |= 1;
          emitir();
        },
        alError,
      );
      const quitarResumen = onSnapshot(
        collectionGroup(db(), COLECCION_RESUMEN),
        (s) => {
          for (const c of s.docChanges()) {
            if (c.doc.id !== "contadores") continue;
            const alumnoId = c.doc.ref.parent.parent?.id;
            if (!alumnoId) continue;
            if (c.type === "removed") resumenes.delete(alumnoId);
            else resumenes.set(alumnoId, c.doc.data() as DocContadores);
          }
          listos |= 2;
          emitir();
        },
        alError,
      );
      return () => {
        quitarAlumnos();
        quitarResumen();
      };
    },

    escucharGrupos(alCambiar, alError) {
      return onSnapshot(
        collection(db(), rutas.grupos()),
        (s) =>
          alCambiar(
            s.docs
              .map((d) => {
                const g = d.data() as DocGrupo;
                return { id: d.id, nombre: g.nombre, creado: g.creado, politicas: { ...POLITICAS_POR_DEFECTO, ...g.politicas } } satisfies Grupo;
              })
              .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
          ),
        alError,
      );
    },

    escucharActividad(alumnoId, actividadId, alCambiar, alError) {
      return onSnapshot(
        doc(db(), rutas.actividad(alumnoId, actividadId)),
        (s) => alCambiar(s.exists() ? (s.data() as DocActividad) : null),
        alError,
      );
    },

    crearAlumno: (nuevo) => crearAlumno(nuevo),
    restablecerAlumno: (id) => restablecerAlumno(id),
    actualizarAlumno: (id, cambios) => actualizarAlumno(id, cambios),
    eliminarAlumno: (id) => eliminarAlumno(id),
    guardarGrupo: (id, d) => guardarGrupo(id, d),
    eliminarGrupo: (id) => eliminarGrupo(id),
    calificar: async (alumnoId, actividadId, nota) => {
      await calificar(alumnoId, actividadId, nota);
    },
  };
}
