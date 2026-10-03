/// <reference types="vite/client" />

/** Versión de la app (package.json), inyectada por Vite. */
declare const __VERSION_APP__: string;

interface ImportMetaEnv {
  /** "1" para usar el núcleo simulado (en memoria) en lugar de Firebase. */
  readonly VITE_RLP_SIMULADO?: string;
}
