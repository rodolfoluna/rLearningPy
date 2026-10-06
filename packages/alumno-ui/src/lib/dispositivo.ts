// ¿Este equipo es una computadora (de escritorio o laptop)? Algunas funciones, como "Crear programa
// .exe", solo tienen sentido ahí: se muestran si el dispositivo no es celular ni tableta Y la
// pantalla es grande (ver PANTALLA_GRANDE, que se vigila al cambiar el tamaño de la ventana).

/** Lo que se lee de `navigator` (separado para poder probarlo sin navegador). */
export interface InfoNavegador {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean } | null;
}

/** Pantalla grande: ventana de computadora (no celular, no tableta vertical). */
export const PANTALLA_GRANDE = "(min-width: 900px)";

const UA_MOVIL = /Android|iPhone|iPad|iPod|Mobile/i;

/** ¿Celular o tableta? */
export function esCelularOTableta(n: InfoNavegador): boolean {
  // Client Hints (Chrome, Edge): fiable para celulares. Las tabletas Android dicen mobile: false,
  // por eso se revisa además el user agent.
  if (n.userAgentData?.mobile === true) return true;
  if (UA_MOVIL.test(n.userAgent)) return true;
  // iPadOS se presenta como Mac de escritorio ("MacIntel"), pero con pantalla táctil.
  return n.platform === "MacIntel" && (n.maxTouchPoints ?? 0) > 1;
}

/** ¿Computadora con pantalla grande? `pantallaGrande` = resultado de matchMedia(PANTALLA_GRANDE). */
export function esComputadora(n: InfoNavegador, pantallaGrande: boolean): boolean {
  return pantallaGrande && !esCelularOTableta(n);
}
