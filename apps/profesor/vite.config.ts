import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// COOP/COEP habilitan SharedArrayBuffer (input() síncrono en el worker de Python).
const aislamiento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1421, strictPort: true, headers: aislamiento },
  preview: { port: 1421, strictPort: true, headers: aislamiento },
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
