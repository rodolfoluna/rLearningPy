// Lo que cada cáscara de la App Alumno (nativa o web) le da a la interfaz compartida.

import type { PuenteEntrada } from "@rlp/python-worker";
import type { Component } from "svelte";
import type { Backend } from "./backend";

export interface OpcionesApp {
  /** Núcleo: Firebase (versión web) o simulación. */
  backend: () => Promise<Backend>;
  /** Entrada síncrona para `input()` cuando no hay SharedArrayBuffer (puente de la app nativa). */
  puenteEntrada?: PuenteEntrada;
  /** Al montar la interfaz (p. ej. escuchar el cierre de la ventana). */
  alIniciar?: () => void | Promise<void>;
  /**
   * Área del profesor (misma app, mismo login). Se carga con `import()` solo cuando entra el
   * profesor, para que los alumnos no la descarguen. Recibe `salir` para cerrar sesión.
   */
  vistaProfesor?: () => Promise<Component<{ salir: () => Promise<void> }>>;
  /** Autoprueba de extremo a extremo, si el núcleo indica una fase. */
  autoprueba?: (fase: string) => Promise<void>;
}

export const opciones: Partial<OpcionesApp> = {};
