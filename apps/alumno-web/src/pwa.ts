// Lo propio de la app instalable: service worker (sin conexión y página aislada), versión nueva,
// guardado persistente y ayuda para instalarla. Solo en la compilación publicada (no en `vite dev`).
//
// Con datos móviles (@rlp/nube/red) no se descarga nada pesado sin avisar: la precarga de Python
// espera al Wi‑Fi y la versión nueva de la app también (ver `install` en sw.js); se puede pedir
// con "Descargar ahora".

import { avisar, prepararCierre } from "@rlp/alumno-ui";
import { alCambiarRed, avisarRedAlServiceWorker, CACHE_RED, tipoRed } from "@rlp/nube/red";

const esIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function leer(almacen: Storage, clave: string): string | null {
  try {
    return almacen.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(almacen: Storage, clave: string, valor: string) {
  try {
    almacen.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/**
 * Registra el service worker. Devuelve `false` si la página se va a recargar: en la primera
 * visita la página llegó sin COOP/COEP y hay que pedirla otra vez a través del service worker.
 */
export async function prepararPwa(): Promise<boolean> {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return true;
  let registro: ServiceWorkerRegistration;
  try {
    registro = await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("Sin service worker: la app no funcionará sin conexión.", e);
    return true;
  }
  if (!crossOriginIsolated && !leer(sessionStorage, "rlp-aislar")) {
    guardar(sessionStorage, "rlp-aislar", "1"); // una sola vez: nunca recargar en bucle
    if (navigator.serviceWorker.controller || (await primeraInstalacion(registro))) {
      location.reload();
      return false;
    }
    // No se pudo instalar: la app sigue sin aislamiento (la consola avisa si input() no está).
  }
  vigilarRed();
  vigilarVersiones(registro);
  void precargar();
  void navigator.storage?.persist?.().catch(() => false);
  ofrecerInstalacion();
  return true;
}

/**
 * Espera a que el primer service worker tome el control de la página. Devuelve `false` si su
 * instalación falla o tarda demasiado (red muy lenta): mejor abrir la app sin aislamiento que
 * dejarla en "Preparando…".
 */
function primeraInstalacion(registro: ServiceWorkerRegistration): Promise<boolean> {
  return new Promise((resolver) => {
    navigator.serviceWorker.addEventListener("controllerchange", () => resolver(true), { once: true });
    const sw = registro.installing ?? registro.waiting;
    sw?.addEventListener("statechange", () => sw.state === "redundant" && resolver(false));
    setTimeout(() => resolver(false), 90_000);
  });
}

/** El service worker no siempre ve el tipo de red: la página se lo dice (ver sw.js). */
function vigilarRed() {
  void avisarRedAlServiceWorker();
  alCambiarRed((t) => void avisarRedAlServiceWorker(t));
}

/** Espera (sin bloquear) a que la red no sea de datos móviles. */
function sinDatosMoviles(): Promise<void> {
  if (tipoRed() !== "celular") return Promise.resolve();
  return new Promise((listo) => {
    const quitar = alCambiarRed((t) => {
      if (t === "celular") return;
      quitar();
      listo();
    });
  });
}

/**
 * Descarga Pyodide en segundo plano para que Python funcione sin conexión. Con datos móviles espera
 * al Wi‑Fi (si el alumno necesita Python antes, la app le pregunta: ver DescargaPython.svelte).
 */
async function precargar() {
  await sinDatosMoviles();
  const registro = await navigator.serviceWorker.ready;
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.tipo !== "precarga" || e.data.hechos !== e.data.total) return;
    if (!leer(localStorage, "rlp-sin-conexion")) {
      guardar(localStorage, "rlp-sin-conexion", String(Date.now()));
      avisar("Listo: la app ya funciona sin conexión.", 5000);
    }
  });
  registro.active?.postMessage({ tipo: "precargar" });
}

function vigilarVersiones(registro: ServiceWorkerRegistration) {
  let actualizando = false;
  const ofrecer = (nuevo: ServiceWorker) =>
    barra("Hay una versión nueva de la app.", "Actualizar", async () => {
      actualizando = true;
      await prepararCierre(); // guarda lo pendiente del editor antes de recargar
      nuevo.postMessage({ tipo: "activar" });
    });
  navigator.serviceWorker.addEventListener("controllerchange", () => actualizando && location.reload());
  if (registro.waiting && navigator.serviceWorker.controller) ofrecer(registro.waiting);
  registro.addEventListener("updatefound", () => {
    const nuevo = registro.installing;
    nuevo?.addEventListener("statechange", () => {
      if (nuevo.state === "installed" && navigator.serviceWorker.controller) ofrecer(nuevo);
    });
  });
  // Revisa si hay versión nueva cada hora mientras la app está abierta (con datos móviles, no) y
  // al pasar a Wi‑Fi (por si se pospuso).
  const revisar = () => void registro.update().catch(() => undefined);
  setInterval(() => tipoRed() !== "celular" && revisar(), 60 * 60 * 1000);
  alCambiarRed((t) => t !== "celular" && revisar());

  // Con datos móviles el service worker no descarga la versión nueva (ver sw.js) y avisa: se ofrece
  // descargarla de todos modos, una vez por sesión.
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.tipo !== "actualizacion-pospuesta" || leer(sessionStorage, "rlp-actualizacion-pospuesta")) return;
    guardar(sessionStorage, "rlp-actualizacion-pospuesta", "1");
    barra(
      "Hay una versión nueva de la app (≈2 MB). Se descargará cuando tengas Wi‑Fi.",
      "Descargar ahora",
      async () => {
        await permitirActualizacion();
        revisar();
      },
    );
  });
  // Con datos móviles se pregunta una vez al abrir (solo baja sw.js, unos KB) para poder avisar.
  if (tipoRed() === "celular") revisar();
}

/** Deja que el service worker descargue la versión nueva aunque haya datos móviles (una vez). */
async function permitirActualizacion() {
  try {
    const c = await caches.open(CACHE_RED);
    await c.put("permiso-actualizar", new Response(String(Date.now())));
  } catch {
    /* sin Cache Storage */
  }
}

interface EventoInstalar extends Event {
  prompt(): Promise<void>;
}

function ofrecerInstalacion() {
  const instalada =
    matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (instalada || leer(localStorage, "rlp-no-instalar")) return;
  const noOfrecerMas = () => guardar(localStorage, "rlp-no-instalar", "1");
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    barra(
      "Instala la app: funciona sin conexión y tus avances quedan más seguros.",
      "Instalar",
      () => (e as EventoInstalar).prompt(),
      noOfrecerMas,
    );
  });
  if (esIos) {
    barra(
      "Para instalarla toca Compartir y luego «Agregar a pantalla de inicio». Así funciona sin conexión y Safari no borra tus avances.",
      null,
      null,
      noOfrecerMas,
    );
  }
}

/** Barra al pie de la página con un mensaje, un botón opcional y la opción de cerrarla. */
function barra(texto: string, boton: string | null, accion: (() => unknown) | null, alCerrar?: () => void) {
  const div = document.createElement("div");
  div.setAttribute("role", "status");
  div.style.cssText =
    "position:fixed;left:50%;bottom:max(1rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:900;" +
    "display:flex;gap:.75em;align-items:center;max-width:min(92vw,640px);padding:.7em 1em;border-radius:12px;" +
    "background:var(--superficie,#fff);color:var(--texto,#1b1b1b);box-shadow:0 6px 24px rgb(0 0 0/.25);font-size:.95em";
  const p = document.createElement("span");
  p.textContent = texto;
  div.append(p);
  if (boton && accion) {
    const b = document.createElement("button");
    b.className = "primario";
    b.textContent = boton;
    b.onclick = () => {
      div.remove();
      void accion();
    };
    div.append(b);
  }
  const x = document.createElement("button");
  x.className = "fantasma";
  x.setAttribute("aria-label", "Cerrar");
  x.textContent = "✕";
  x.onclick = () => {
    div.remove();
    alCerrar?.();
  };
  div.append(x);
  document.body.append(div);
}
