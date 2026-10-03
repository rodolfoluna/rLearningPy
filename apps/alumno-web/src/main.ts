// App web (PWA) única: pantalla de acceso común; según la cuenta entra al área del alumno
// (@rlp/alumno-ui) o a la del profesor (src/rol/profesor, se descarga solo si entra el profesor).
import { iniciarApp } from "@rlp/alumno-ui";
import { prepararPwa } from "./pwa";

const env = import.meta.env;
const sinConfiguracion = !env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_EMULATOR !== "1";
/**
 * Núcleo simulado (en memoria): con VITE_RLP_SIMULADO=1, o en `vite dev` con `?simulado` o sin
 * configuración de Firebase. La compilación publicada usa siempre Firebase.
 */
const simulado =
  env.VITE_RLP_SIMULADO === "1" || (env.DEV && (new URLSearchParams(location.search).has("simulado") || sinConfiguracion));

// En la primera visita la página se recarga una vez a través del service worker (ver pwa.ts).
if (await prepararPwa()) {
  if (simulado) console.info("RLP: núcleo simulado (en memoria), sin Firebase.");
  iniciarApp({
    backend: simulado
      ? () => import("@rlp/alumno-ui/simulado").then((m) => m.crearBackendSimulado())
      : () => import("./backend-firebase").then((m) => m.crearBackendFirebase()),
    vistaProfesor: () => import("./rol/profesor").then((m) => m.cargarAreaProfesor(simulado)),
  });
}
