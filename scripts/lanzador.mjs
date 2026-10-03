// Compila el lanzador de Windows (lanzador/, Rust) y lo copia a la app web.
//
//   node scripts/lanzador.mjs                → apps/alumno-web/public/lanzador/
//   node scripts/lanzador.mjs --salida <dir> → a otra carpeta (la usa el workflow de GitHub Actions)
//   node scripts/lanzador.mjs --solo-python  → solo descarga y verifica el Python embebido
//   node scripts/lanzador.mjs --probar       → además (en Windows) arma un .exe de ejemplo con
//                                              input() y acentos, lo ejecuta y revisa la salida
//
// 1. Descarga el Python "embeddable" de Windows fijado en lanzador/python.json (si no está ya) y
//    verifica su SHA-256.
// 2. cargo build --release (en Windows con MSVC; en otro sistema, con el destino
//    x86_64-pc-windows-gnu, que necesita mingw-w64).
// 3. Copia rlp-lanzador.exe y escribe lanzador.json con la versión, el tamaño y el SHA-256.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const carpetaLanzador = join(raiz, "lanzador");
const args = process.argv.slice(2);
const opcion = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const salida = resolve(raiz, opcion("--salida") ?? "apps/alumno-web/public/lanzador");

const sha256 = (datos) => createHash("sha256").update(datos).digest("hex");

const python = JSON.parse(readFileSync(join(carpetaLanzador, "python.json"), "utf8"));
const zip = join(carpetaLanzador, "python", python.archivo);
if (!existsSync(zip) || sha256(readFileSync(zip)) !== python.sha256) {
  console.log(`Descargando ${python.url}`);
  const r = await fetch(python.url);
  if (!r.ok) throw new Error(`No se pudo descargar ${python.url}: ${r.status}`);
  const datos = Buffer.from(await r.arrayBuffer());
  const huella = sha256(datos);
  if (huella !== python.sha256) throw new Error(`SHA-256 inesperado para ${python.archivo}: ${huella} (se esperaba ${python.sha256})`);
  mkdirSync(dirname(zip), { recursive: true });
  writeFileSync(zip, datos);
}
console.log(`Python ${python.version} embebido: ${zip} (SHA-256 verificado)`);
if (args.includes("--solo-python")) process.exit(0);

const destino = process.platform === "win32" ? null : "x86_64-pc-windows-gnu";
const cargo = spawnSync("cargo", ["build", "--release", "--locked", ...(destino ? ["--target", destino] : [])], {
  cwd: carpetaLanzador,
  stdio: "inherit",
});
if (cargo.status !== 0) {
  console.error("\nNo se pudo compilar el lanzador. ¿Está instalado Rust (https://rustup.rs)?");
  process.exit(cargo.status ?? 1);
}

const exe = join(carpetaLanzador, "target", ...(destino ? [destino] : []), "release", "rlp-lanzador.exe");
const datos = readFileSync(exe);
const version = (readFileSync(join(carpetaLanzador, "Cargo.toml"), "utf8").match(/^version\s*=\s*"([^"]+)"/m) ?? [])[1];
mkdirSync(salida, { recursive: true });
copyFileSync(exe, join(salida, "rlp-lanzador.exe"));
const info = { version, python: python.version, tamano: statSync(exe).size, sha256: sha256(datos) };
writeFileSync(join(salida, "lanzador.json"), JSON.stringify(info, null, 2) + "\n");
console.log(`Lanzador ${version} (${(info.tamano / 1024 / 1024).toFixed(1)} MB) → ${join(salida, "rlp-lanzador.exe")}`);

if (args.includes("--probar") && process.platform === "win32") {
  // Mismo formato que packages/alumno-ui/src/lib/ejecutable.ts (armarRemolque).
  const bloque = (texto, magia) => {
    const b = Buffer.from(texto, "utf8");
    const largo = Buffer.alloc(4);
    largo.writeUInt32LE(b.length);
    return Buffer.concat([b, largo, Buffer.from(magia)]);
  };
  const script = 'nombre = input("¿Cómo te llamas? ")\nprint(f"¡Hola, {nombre}! Año, pingüino.")\n';
  const carpeta = mkdtempSync(join(tmpdir(), "rlp-prueba-lanzador-"));
  const prueba = join(carpeta, "prueba.exe");
  writeFileSync(prueba, Buffer.concat([datos, bloque("Prueba", "RLPNOMBR"), bloque(script, "RLPSCRPT")]));
  const r = spawnSync(prueba, [], {
    input: "Ana\n\n",
    encoding: "utf8",
    env: { ...process.env, LOCALAPPDATA: join(carpeta, "datos") },
    timeout: 120_000,
  });
  rmSync(carpeta, { recursive: true, force: true });
  console.log(r.stdout);
  if (r.status !== 0 || !r.stdout.includes("¡Hola, Ana! Año, pingüino.") || !r.stdout.includes("Presiona Enter para salir")) {
    console.error(`La prueba del lanzador falló (código ${r.status}).\n${r.stderr ?? ""}`);
    process.exit(1);
  }
  console.log("Prueba del lanzador: correcta.");
}
