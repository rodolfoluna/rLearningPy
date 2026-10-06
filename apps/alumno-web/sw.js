// Service worker de LP Alumno (versión web). Esta es la plantilla: al compilar, vite.config.ts
// la copia a dist/sw.js con la versión y la lista de archivos de esa compilación.
//
// - Guarda la app y Pyodide para usarla sin conexión (Pyodide en una caché aparte, que se conserva
//   entre versiones de la app mientras Pyodide no cambie).
// - El lanzador de Windows (lanzador/, ~13 MB, para "Crear programa .exe") no se precarga ni pasa
//   por aquí: la página lo descarga cuando hace falta y lo guarda en su propia caché
//   ("rlp-lanzador"), que se conserva entre versiones.
// - Agrega COOP/COEP a cada respuesta: la página queda aislada (SharedArrayBuffer, que necesita
//   input()) aunque el hosting no permita encabezados, como GitHub Pages.
// - La primera instalación se activa sola; una versión nueva espera a que la página la active
//   (botón "Actualizar"), para no cambiar la app a mitad de un ejercicio.
// - Con datos móviles una versión nueva no se descarga (1–3 MB): la instalación falla a propósito
//   antes de bajar nada, avisa a la página ("actualizacion-pospuesta") y el navegador lo vuelve a
//   intentar en la siguiente revisión (al abrir la app o, desde la página, al pasar a Wi‑Fi). La
//   página puede dar permiso para una vez ("Descargar ahora").

const VERSION = "__VERSION__";
const CACHE_APP = `rlp-app-${VERSION}`;
const CACHE_PYODIDE = "rlp-pyodide-__VERSION_PYODIDE__";
const ARCHIVOS_APP = __ARCHIVOS_APP__;
const ARCHIVOS_PYODIDE = __ARCHIVOS_PYODIDE__;
const CACHE_LANZADOR = "rlp-lanzador";
/** Lo escribe la página (@rlp/nube/red): tipo de red que ve ("tipo") y permiso de actualizar. */
const CACHE_RED = "rlp-red";
const PERMISO_VIGENTE_MS = 15 * 60_000;

/**
 * ¿Datos móviles? En Chrome para Android el service worker ve `connection.type`; si no, usa lo que
 * le dijo la página. Misma regla que @rlp/nube/red (el Ahorro de datos cuenta como datos móviles).
 */
async function conDatosMoviles() {
  const c = self.navigator.connection;
  if (c?.saveData) return true;
  if (["cellular", "wifi", "ethernet", "wimax"].includes(c?.type)) return c.type === "cellular";
  try {
    const r = await (await caches.open(CACHE_RED)).match("tipo");
    return r ? (await r.json()).tipo === "celular" : false;
  } catch {
    return false;
  }
}

/** ¿La página permitió descargar esta vez aunque haya datos móviles? (el permiso se gasta) */
async function actualizacionPermitida() {
  try {
    const cache = await caches.open(CACHE_RED);
    const r = await cache.match("permiso-actualizar");
    if (!r) return false;
    await cache.delete("permiso-actualizar");
    return Date.now() - Number(await r.text()) < PERMISO_VIGENTE_MS;
  } catch {
    return false;
  }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      // Una actualización (ya hay versión activa) con datos móviles se pospone sin descargar nada.
      if (self.registration.active && (await conDatosMoviles()) && !(await actualizacionPermitida())) {
        for (const cliente of await self.clients.matchAll({ includeUncontrolled: true })) {
          cliente.postMessage({ tipo: "actualizacion-pospuesta" });
        }
        throw new Error("Actualización pospuesta: datos móviles.");
      }
      const cache = await caches.open(CACHE_APP);
      await cache.addAll(ARCHIVOS_APP.map((ruta) => new Request(ruta, { cache: "reload" })));
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("rlp-") && nombre !== CACHE_APP && nombre !== CACHE_PYODIDE && nombre !== CACHE_LANZADOR && nombre !== CACHE_RED) {
          await caches.delete(nombre);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "activar") void self.skipWaiting();
  if (evento.data?.tipo === "precargar") evento.waitUntil(precargarPyodide(evento.source));
});

/** Descarga Pyodide a su caché (en segundo plano) y avisa el avance a la página. */
async function precargarPyodide(cliente) {
  const cache = await caches.open(CACHE_PYODIDE);
  let hechos = 0;
  for (const ruta of ARCHIVOS_PYODIDE) {
    if (!(await cache.match(ruta))) {
      const respuesta = await fetch(ruta, { cache: "reload" });
      if (!respuesta.ok) throw new Error(`No se pudo descargar ${ruta}`);
      await cache.put(ruta, respuesta);
    }
    hechos++;
    cliente?.postMessage({ tipo: "precarga", hechos, total: ARCHIVOS_PYODIDE.length });
  }
}

/** Copia la respuesta con los encabezados que aíslan la página. */
function aislar(respuesta) {
  if (respuesta.status === 0 || respuesta.type === "opaqueredirect") return respuesta;
  const encabezados = new Headers(respuesta.headers);
  encabezados.set("Cross-Origin-Opener-Policy", "same-origin");
  encabezados.set("Cross-Origin-Embedder-Policy", "require-corp");
  encabezados.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: encabezados,
  });
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== location.origin) return;
  // El lanzador lo administra la página (ver arriba): directo a la red, sin copiar el binario.
  if (url.pathname.includes("/lanzador/")) return;
  evento.respondWith(
    (async () => {
      let respuesta = await caches.match(pedido, { ignoreSearch: true });
      // La página se pide como "./" (o con otra ruta): siempre es index.html.
      if (!respuesta && pedido.mode === "navigate") {
        respuesta = await caches.match(new URL("index.html", self.registration.scope).href);
      }
      if (!respuesta) {
        respuesta = await fetch(pedido);
        if (respuesta.ok && url.pathname.includes("/pyodide/")) {
          const cache = await caches.open(CACHE_PYODIDE);
          await cache.put(pedido, respuesta.clone());
        }
      }
      return aislar(respuesta);
    })(),
  );
});
