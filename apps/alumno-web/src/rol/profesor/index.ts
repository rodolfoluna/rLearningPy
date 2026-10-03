// Entrada del área del profesor: main.ts la carga con import() solo cuando entra el profesor
// (los alumnos no descargan este código ni el curso con soluciones).

import { configurarDatos } from "./lib/datos";
import { crearDatosFirebase } from "./lib/datos-firebase";
import { crearDatosSimulados } from "./lib/datos-simulado";
import AreaProfesor from "./AreaProfesor.svelte";

export function cargarAreaProfesor(simulado: boolean) {
  configurarDatos(simulado ? crearDatosSimulados() : crearDatosFirebase());
  return AreaProfesor;
}
