// Versión web (PWA) de la App Alumno (@rlp/alumno-ui).
// TEMPORAL: usa el backend simulado (en memoria) hasta que exista backend-firebase.ts (etapa 4).
import { iniciarApp } from "@rlp/alumno-ui";
import { prepararPwa } from "./pwa";

// En la primera visita la página se recarga una vez a través del service worker (ver pwa.ts).
if (await prepararPwa()) {
  iniciarApp({
    backend: () => import("@rlp/alumno-ui/simulado").then((m) => m.crearBackendSimulado()),
  });
}
