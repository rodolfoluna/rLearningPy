// Textos del indicador de sincronización y del recordatorio de avances sin enviar.

import type { EstadoSincronizacion, InfoRed } from "./tipos";

/** Pasado este tiempo con avances sin enviar (y aún con datos móviles) se recuerda una vez. */
export const RECORDATORIO_MS = 24 * 3600_000;

export function textoSync(e: EstadoSincronizacion, red: InfoRed | null): string {
  const manual = red?.ajuste === "manual";
  switch (e) {
    case "sin-conexion":
      return "Sin conexión — cambios guardados en este equipo";
    case "sincronizando":
      return "Sincronizando…";
    case "sincronizado":
      return "Sincronizado";
    case "pendiente-datos":
      return manual ? "Hay avances sin enviar (envío manual)" : "Hay avances sin enviar (datos móviles)";
    case "enviando-datos":
      return red?.tipo === "celular" ? "Enviando con datos móviles…" : "Enviando…";
    case "en-pausa":
      return manual ? "Al día · se envía cuando lo pidas" : "Al día · con datos móviles se envía cuando lo pidas";
  }
}

/** "hace 2 días", "hace 1 día" o "de hace más de un día". */
export function haceCuanto(desde: number, ahora = Date.now()): string {
  const dias = Math.floor((ahora - desde) / (24 * 3600_000));
  return dias <= 1 ? "hace 1 día" : `hace ${dias} días`;
}
