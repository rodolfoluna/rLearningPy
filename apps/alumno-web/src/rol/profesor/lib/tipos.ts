// Tipos del área del profesor.

import type { Contadores, DocActividad, NotaProfesor, PoliticasGrupo, ResumenAvance } from "@rlp/nube";

export type Nivel = "verde" | "amarillo" | "rojo";

/** Un alumno en el tablero: su documento más el resumen (avance, contadores y notas). */
export interface AlumnoFila {
  id: string;
  nombre: string;
  control: string;
  grupo: string | null;
  correo: string;
  debeCambiarClave: boolean;
  creado: number;
  /** Última vez que su app estuvo en línea con todo enviado (o que llegaron sus contadores). */
  ultimaSync: number | null;
  global: Contadores;
  porActividad: Record<string, Contadores>;
  avance: Record<string, ResumenAvance>;
  notas: Record<string, NotaProfesor>;
}

export interface Grupo {
  id: string;
  nombre: string;
  politicas: PoliticasGrupo;
  creado?: number;
}

export type Actividad = Partial<DocActividad>;

/** Operación de edición con su momento: [t (epoch ms), desde, hasta, insertado, origen]. */
export type OpConTiempo = [number, number, number, string, string];

export interface Tramo {
  dispositivo: string;
  motivo: "inicio" | "reinicio" | "continuacion" | string;
  texto_inicial: string | null;
  ops: OpConTiempo[];
  t_inicio: number;
  t_fin: number;
}

export interface Marca {
  t: number;
  tipo: string;
  dispositivo: string;
  datos: Record<string, unknown> | null;
}

export interface LineaDeTiempo {
  actividad: string;
  tramos: Tramo[];
  marcas: Marca[];
  codigo_final: string;
  avisos: string[];
}

export interface Ritmo {
  tecleados: number;
  automaticos: number;
  deshacer_rehacer: number;
  pegados: number;
  otros: number;
  max_cps: number;
  rafagas: number;
}
