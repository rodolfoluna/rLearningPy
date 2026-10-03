import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, loadEnv, type Plugin } from "vite";

const raiz = fileURLToPath(new URL(".", import.meta.url));

// COOP/COEP habilitan SharedArrayBuffer (input() síncrono en el worker de Python). En el sitio
// publicado los agrega el service worker, así que sirve en cualquier hosting.
const aislamiento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? listar(ruta) : [ruta];
  });
}

/** Genera dist/sw.js a partir de la plantilla sw.js con los archivos y la versión de esta compilación. */
function serviceWorker(): Plugin {
  return {
    name: "rlp-service-worker",
    apply: "build",
    closeBundle() {
      const dist = join(raiz, "dist");
      const archivos = listar(dist)
        .map((r) => relative(dist, r).split(sep).join("/"))
        .filter((r) => r !== "sw.js")
        .sort();
      // El área del profesor no se guarda por adelantado: los alumnos no la necesitan.
      const app = archivos.filter((r) => !r.startsWith("pyodide/") && !r.startsWith("assets/area-profesor-"));
      const pyodide = archivos.filter((r) => r.startsWith("pyodide/"));
      const huella = createHash("sha256");
      for (const r of app) huella.update(r).update(readFileSync(join(dist, r)));
      const versionPyodide = JSON.parse(readFileSync(join(dist, "pyodide/package.json"), "utf8")).version;
      const sw = readFileSync(join(raiz, "sw.js"), "utf8")
        .replace("__VERSION__", huella.digest("hex").slice(0, 12))
        .replace("__VERSION_PYODIDE__", versionPyodide)
        .replace("__ARCHIVOS_APP__", JSON.stringify(app))
        .replace("__ARCHIVOS_PYODIDE__", JSON.stringify(pyodide));
      writeFileSync(join(dist, "sw.js"), sw);
    },
  };
}

/**
 * Ruta base del sitio. Por defecto relativa ("./"): funciona en la raíz de un dominio o en
 * cualquier subcarpeta. El workflow de GitHub Pages usa RLP_BASE=/<repositorio>/ (también se
 * puede poner en un archivo .env del modo, como .env.emulador).
 */
function rutaBase(mode: string): string {
  const base = (process.env.RLP_BASE || loadEnv(mode, raiz, "RLP_").RLP_BASE || "./").trim();
  return base === "./" || base.endsWith("/") ? base : `${base}/`;
}

export default defineConfig(({ mode }) => ({
  base: rutaBase(mode),
  plugins: [svelte(), serviceWorker()],
  clearScreen: false,
  server: { port: 1422, strictPort: true, headers: aislamiento },
  preview: { port: 1422, strictPort: true, headers: aislamiento },
  worker: { format: "es" },
  define: { __VERSION_APP__: JSON.stringify(JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version) },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // El área del profesor (con el curso con soluciones) se llama assets/area-profesor-*.js para que
        // el service worker no la guarde por adelantado en los equipos de los alumnos.
        chunkFileNames: (c) =>
          c.isDynamicEntry && c.facadeModuleId?.split("\\").join("/").endsWith("/src/rol/profesor/index.ts")
            ? "assets/area-profesor-[hash].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
}));
