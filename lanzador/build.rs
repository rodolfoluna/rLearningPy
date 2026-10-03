//! Incrusta el paquete "embeddable" oficial de Python para Windows (amd64).
//!
//! La versión y el SHA-256 están fijados en `python.json`. El .zip no se guarda en git: lo
//! descarga `node scripts/lanzador.mjs` (o `pnpm lanzador`) a `lanzador/python/`. También se
//! puede indicar otra ruta con la variable RLP_PYTHON_ZIP. Aquí solo se verifica la huella.

use sha2::{Digest, Sha256};
use std::path::PathBuf;

fn main() {
    let raiz = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let fijado = raiz.join("python.json");
    println!("cargo:rerun-if-changed={}", fijado.display());
    println!("cargo:rerun-if-env-changed=RLP_PYTHON_ZIP");

    let info: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&fijado).expect("no se pudo leer python.json"))
        .expect("python.json inválido");
    let campo = |k: &str| {
        info[k]
            .as_str()
            .unwrap_or_else(|| panic!("python.json: falta \"{k}\""))
            .to_string()
    };
    let (version, archivo, sha256) = (campo("version"), campo("archivo"), campo("sha256").to_lowercase());

    let zip = std::env::var_os("RLP_PYTHON_ZIP")
        .map(PathBuf::from)
        .unwrap_or_else(|| raiz.join("python").join(&archivo));
    println!("cargo:rerun-if-changed={}", zip.display());
    let datos = std::fs::read(&zip).unwrap_or_else(|e| {
        panic!(
            "\n\nNo se encontró {} ({e}).\nDescárgalo con `pnpm lanzador` (scripts/lanzador.mjs) o define RLP_PYTHON_ZIP.\n\n",
            zip.display()
        )
    });
    let huella: String = Sha256::digest(&datos).iter().map(|b| format!("{b:02x}")).collect();
    if huella != sha256 {
        panic!(
            "\n\nEl SHA-256 de {} no coincide.\n  esperado: {sha256}\n  obtenido: {huella}\n\n",
            zip.display()
        );
    }

    println!("cargo:rustc-env=RLP_PYTHON_ZIP={}", zip.canonicalize().unwrap().display());
    println!("cargo:rustc-env=RLP_PYTHON_VERSION={version}");
    println!("cargo:rustc-env=RLP_PYTHON_HUELLA={}", &huella[..8]);
}
