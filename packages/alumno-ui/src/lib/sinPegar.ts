// Acción de Svelte para campos de texto fuera del editor (dato de input() en la consola,
// respuesta de una predicción): bloquea pegar y soltar texto, por teclado, menú o arrastre,
// incluidos los teclados de celular que pegan con `beforeinput` (insertFromPaste).

const TIPOS_BLOQUEADOS = new Set(["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertReplacementText"]);

export type AlBloquear = (info: { chars: number; via: "teclado" | "soltar" | "entrada" }) => void;

export function sinPegar(nodo: HTMLElement, alBloquear?: AlBloquear) {
  let aviso = alBloquear;
  const pegar = (e: ClipboardEvent) => {
    e.preventDefault();
    aviso?.({ chars: e.clipboardData?.getData("text/plain").length ?? 0, via: "teclado" });
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    aviso?.({ chars: e.dataTransfer?.getData("text/plain").length ?? 0, via: "soltar" });
  };
  const antesDeEntrada = (e: InputEvent) => {
    // insertReplacementText es el autocorrector: solo se bloquea si inserta mucho texto.
    if (!TIPOS_BLOQUEADOS.has(e.inputType)) return;
    const texto = e.data ?? e.dataTransfer?.getData("text/plain") ?? "";
    if (e.inputType === "insertReplacementText" && texto.length < 20) return;
    e.preventDefault();
    aviso?.({ chars: texto.length, via: "entrada" });
  };
  nodo.addEventListener("paste", pegar);
  nodo.addEventListener("drop", soltar);
  nodo.addEventListener("beforeinput", antesDeEntrada);
  return {
    update(nuevo?: AlBloquear) {
      aviso = nuevo;
    },
    destroy() {
      nodo.removeEventListener("paste", pegar);
      nodo.removeEventListener("drop", soltar);
      nodo.removeEventListener("beforeinput", antesDeEntrada);
    },
  };
}
