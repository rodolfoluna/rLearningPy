// Simula `navigator.connection` (Chrome para Android) en las pruebas: el tipo de red inicial y
// `cambiarRed(page, "wifi")`, que emite el evento `change` como el navegador real.
import type { BrowserContext, Page } from "@playwright/test";

/** `tipo`: "cellular", "wifi"… o `undefined` (como Chrome de escritorio: sin `type`). */
export async function simularConexion(context: BrowserContext, tipo: string | undefined, saveData = false) {
  await context.addInitScript(
    ([t, ahorro]) => {
      class ConexionSimulada extends EventTarget {
        type = t as string | undefined;
        saveData = ahorro as boolean;
        effectiveType = "4g";
      }
      const c = new ConexionSimulada();
      Object.defineProperty(Navigator.prototype, "connection", { get: () => c, configurable: true });
      (window as unknown as { __cambiarRed: (n?: string, s?: boolean) => void }).__cambiarRed = (nuevo, s = false) => {
        c.type = nuevo;
        c.saveData = s;
        c.dispatchEvent(new Event("change"));
      };
    },
    [tipo, saveData] as const,
  );
}

export async function cambiarRed(page: Page, tipo: string | undefined, saveData = false) {
  await page.evaluate(
    ([t, s]) => (window as unknown as { __cambiarRed: (n?: string, s?: boolean) => void }).__cambiarRed(t, s),
    [tipo, saveData] as const,
  );
}
