// Nivel de alerta (semáforo) de un alumno a partir de sus contadores antitrampa.
//
// La versión de escritorio verificaba firmas y reconstruía cada entrega; en la nube el código
// llega directo de la app, así que el semáforo resume las señales que la app registra:
//  - rojo: inserciones sospechosas (texto que aparece en el editor sin teclearlo) o muchos
//    intentos de pegar;
//  - amarillo: algún intento de pegar o mucho tiempo fuera de la ventana;
//  - verde: nada de lo anterior.
// El detalle de cada alumno agrega el ritmo de escritura (ráfagas imposibles para una persona).

import type { Contadores } from "@rlp/nube";
import type { Nivel } from "./tipos";

export const UMBRALES = {
  /** Intentos de pegar a partir de los cuales el alumno queda en rojo. */
  pegadosRojo: 5,
  /** Tiempo fuera de la ventana que, además de ser mucho en proporción, lo deja en amarillo. */
  tiempoFueraMs: 10 * 60_000,
  /** Proporción del tiempo de práctica pasado fuera de la ventana. */
  proporcionFuera: 0.25,
} as const;

export interface Alerta {
  nivel: Nivel;
  motivos: string[];
}

const peor = (a: Nivel, b: Nivel): Nivel => (a === "rojo" || b === "rojo" ? "rojo" : a === "amarillo" || b === "amarillo" ? "amarillo" : "verde");

export function nivelAlerta(c: Partial<Contadores> | undefined, rafagas = 0): Alerta {
  const motivos: string[] = [];
  let nivel: Nivel = "verde";
  const sospechosas = c?.inserciones_sospechosas ?? 0;
  const pegados = c?.pegados_intentos ?? 0;
  const fuera = c?.tiempo_fuera_ms ?? 0;
  const practica = c?.tiempo_ms ?? 0;
  if (sospechosas > 0) {
    nivel = "rojo";
    motivos.push(`${sospechosas} inserción(es) de texto sin teclear (posible pegado con otra herramienta)`);
  }
  if (pegados >= UMBRALES.pegadosRojo) {
    nivel = "rojo";
    motivos.push(`${pegados} intentos de pegar`);
  } else if (pegados > 0) {
    nivel = peor(nivel, "amarillo");
    motivos.push(`${pegados} intento(s) de pegar`);
  }
  if (fuera >= UMBRALES.tiempoFueraMs && fuera >= practica * UMBRALES.proporcionFuera) {
    nivel = peor(nivel, "amarillo");
    motivos.push(`${Math.round(fuera / 60_000)} min fuera de la ventana`);
  }
  if (rafagas > 0) {
    nivel = peor(nivel, "amarillo");
    motivos.push(`${rafagas} ráfaga(s) de escritura demasiado rápida`);
  }
  return { nivel, motivos };
}

/** Orden para ordenar por nivel (rojo primero al ordenar de mayor a menor). */
export const pesoNivel: Record<Nivel, number> = { verde: 0, amarillo: 1, rojo: 2 };
