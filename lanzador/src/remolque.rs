//! El "remolque": el programa del alumno, pegado al final del lanzador por la app web.
//!
//! Formato (todo al final del .exe; los enteros son u32 little-endian):
//!
//! ```text
//! [lanzador .exe] [nombre UTF-8][len nombre]["RLPNOMBR"] [script UTF-8][len script]["RLPSCRPT"]
//! ```
//!
//! El bloque del nombre es opcional. El mismo formato lo arma `remolque.ts` (packages/alumno-ui);
//! las pruebas de ambos lados comparan los mismos bytes de ejemplo.

use std::io::{self, Read, Seek, SeekFrom};

pub const MAGIA_SCRIPT: &[u8; 8] = b"RLPSCRPT";
pub const MAGIA_NOMBRE: &[u8; 8] = b"RLPNOMBR";
/// Tamaño máximo aceptado para el script o el nombre (evita leer basura enorme).
const MAXIMO: u64 = 16 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub struct Programa {
    pub nombre: Option<String>,
    pub script: String,
}

/// Lee un bloque `[datos][len u32][magia]` que termina en `fin`. Devuelve los datos y dónde empiezan.
fn bloque<R: Read + Seek>(r: &mut R, fin: u64, magia: &[u8; 8]) -> io::Result<Option<(Vec<u8>, u64)>> {
    if fin < 12 {
        return Ok(None);
    }
    let mut cola = [0u8; 12];
    r.seek(SeekFrom::Start(fin - 12))?;
    r.read_exact(&mut cola)?;
    if &cola[4..] != magia {
        return Ok(None);
    }
    let largo = u32::from_le_bytes(cola[..4].try_into().unwrap()) as u64;
    if largo > MAXIMO || largo > fin - 12 {
        return Ok(None);
    }
    let inicio = fin - 12 - largo;
    let mut datos = vec![0u8; largo as usize];
    r.seek(SeekFrom::Start(inicio))?;
    r.read_exact(&mut datos)?;
    Ok(Some((datos, inicio)))
}

/// Busca el programa al final de `r`. `None` si no hay remolque válido.
pub fn leer<R: Read + Seek>(r: &mut R) -> io::Result<Option<Programa>> {
    let fin = r.seek(SeekFrom::End(0))?;
    let Some((script, inicio)) = bloque(r, fin, MAGIA_SCRIPT)? else {
        return Ok(None);
    };
    let Ok(script) = String::from_utf8(script) else {
        return Ok(None);
    };
    let nombre = bloque(r, inicio, MAGIA_NOMBRE)?
        .and_then(|(n, _)| String::from_utf8(n).ok())
        .filter(|n| !n.trim().is_empty());
    Ok(Some(Programa { nombre, script }))
}

/// Arma el remolque (lo usan las pruebas; la app web tiene su propia versión en TypeScript).
#[cfg(test)]
pub fn armar(script: &str, nombre: Option<&str>) -> Vec<u8> {
    let mut v = Vec::new();
    if let Some(n) = nombre {
        v.extend_from_slice(n.as_bytes());
        v.extend_from_slice(&(n.len() as u32).to_le_bytes());
        v.extend_from_slice(MAGIA_NOMBRE);
    }
    v.extend_from_slice(script.as_bytes());
    v.extend_from_slice(&(script.len() as u32).to_le_bytes());
    v.extend_from_slice(MAGIA_SCRIPT);
    v
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::io::Cursor;

    /// Mismo ejemplo que `remolque.test.ts`: nombre "Mi programa", script "print('¡hola!')\n".
    const EJEMPLO_HEX: &str =
        "4d692070726f6772616d610b000000524c504e4f4d42527072696e742827c2a1686f6c612127290a11000000524c505343525054";
    const EJEMPLO_SCRIPT: &str = "print('¡hola!')\n";

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn mismo_formato_que_typescript() {
        let r = armar(EJEMPLO_SCRIPT, Some("Mi programa"));
        assert_eq!(hex(&r), EJEMPLO_HEX);
        let p = leer(&mut Cursor::new(r)).unwrap().unwrap();
        assert_eq!(
            p,
            Programa {
                nombre: Some("Mi programa".into()),
                script: EJEMPLO_SCRIPT.into()
            }
        );
    }

    #[test]
    fn lee_con_nombre_tras_el_lanzador() {
        let mut exe = b"MZ\x90\x00 lanzador falso RLPSCRPT en medio".to_vec();
        exe.extend(armar("x = input('¿Edad? ')\nprint('Tienes', x, 'años')\n", Some("Edad")));
        let p = leer(&mut Cursor::new(exe)).unwrap().unwrap();
        assert_eq!(p.nombre.as_deref(), Some("Edad"));
        assert_eq!(p.script, "x = input('¿Edad? ')\nprint('Tienes', x, 'años')\n");
    }

    #[test]
    fn lee_sin_nombre() {
        let mut exe = vec![0u8; 100];
        exe.extend(armar("print(1)", None));
        assert_eq!(
            leer(&mut Cursor::new(exe)).unwrap(),
            Some(Programa {
                nombre: None,
                script: "print(1)".into()
            })
        );
    }

    #[test]
    fn script_vacio() {
        let p = leer(&mut Cursor::new(armar("", Some("vacío")))).unwrap().unwrap();
        assert_eq!(p.script, "");
        assert_eq!(p.nombre.as_deref(), Some("vacío"));
    }

    #[test]
    fn sin_remolque_o_danado() {
        assert_eq!(leer(&mut Cursor::new(b"MZ solo el lanzador".to_vec())).unwrap(), None);
        assert_eq!(leer(&mut Cursor::new(Vec::new())).unwrap(), None);
        // Largo mayor que el archivo.
        let mut v = b"abc".to_vec();
        v.extend_from_slice(&1000u32.to_le_bytes());
        v.extend_from_slice(MAGIA_SCRIPT);
        assert_eq!(leer(&mut Cursor::new(v)).unwrap(), None);
        // UTF-8 inválido.
        let mut v = vec![0xff, 0xfe];
        v.extend_from_slice(&2u32.to_le_bytes());
        v.extend_from_slice(MAGIA_SCRIPT);
        assert_eq!(leer(&mut Cursor::new(v)).unwrap(), None);
    }
}
