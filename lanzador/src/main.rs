//! Lanzador de RealLearningProgramming.
//!
//! Un .exe de consola con el Python "embeddable" oficial de Windows adentro. La app web le pega
//! al final el programa del alumno (ver `remolque.rs`); al abrirlo:
//!   1. extrae Python (una sola vez) a %LOCALAPPDATA%\RealLearningProgramming\python-<versión>-<huella>;
//!   2. escribe el programa en un .py temporal y lo ejecuta en esta misma consola (input() funciona);
//!   3. al terminar espera Enter, para que la ventana no se cierre sola.

mod remolque;

use std::fs;
use std::io::{self, BufRead, Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{SystemTime, UNIX_EPOCH};

const PYTHON_ZIP: &[u8] = include_bytes!(env!("RLP_PYTHON_ZIP"));
const PYTHON_VERSION: &str = env!("RLP_PYTHON_VERSION");
const PYTHON_HUELLA: &str = env!("RLP_PYTHON_HUELLA");
/// Archivo que marca una extracción completa.
const MARCA: &str = ".rlp-completo";

fn main() -> ExitCode {
    consola::preparar();
    let codigo = match correr() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("\nNo se pudo ejecutar el programa: {e}");
            1
        }
    };
    pausa();
    consola::restaurar();
    ExitCode::from(codigo.clamp(0, 255) as u8)
}

fn correr() -> io::Result<i32> {
    let exe = std::env::current_exe()?;
    let programa = remolque::leer(&mut fs::File::open(&exe)?)?;
    let Some(programa) = programa else {
        println!("Este es el lanzador de RealLearningProgramming (Python {PYTHON_VERSION}).");
        println!();
        println!("Por sí solo no hace nada: en la app, abre una actividad de código y usa");
        println!("el botón \"Crear programa .exe\" para obtener tu programa listo para abrir.");
        return Ok(1);
    };
    let nombre = programa.nombre.clone().unwrap_or_else(|| "programa".into());
    consola::titulo(&nombre);

    let python = preparar_python()?;

    // El .py va en una carpeta temporal propia, con el nombre del programa (así se ve en los errores).
    let temporal = std::env::temp_dir().join(format!("rlp-{}-{}", std::process::id(), marca_tiempo()));
    fs::create_dir_all(&temporal)?;
    let script = temporal.join(format!("{}.py", nombre_archivo(&nombre)));
    fs::write(&script, programa.script.as_bytes())?;

    // Carpeta de trabajo: la del .exe (open("datos.txt") busca junto al programa).
    let carpeta = exe.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("."));
    let estado = Command::new(&python)
        .arg(&script)
        .current_dir(&carpeta)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONSTARTUP")
        .status();
    let _ = fs::remove_dir_all(&temporal);
    let estado = estado?;
    let codigo = estado.code().unwrap_or(1);
    let _ = io::stdout().flush();
    if codigo != 0 {
        println!("\n(El programa terminó con un error: código {codigo}.)");
    }
    Ok(codigo)
}

/// Devuelve la ruta de python.exe, extrayendo Python la primera vez.
fn preparar_python() -> io::Result<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("RealLearningProgramming");
    let destino = base.join(format!("python-{PYTHON_VERSION}-{PYTHON_HUELLA}"));
    let python = destino.join("python.exe");
    if destino.join(MARCA).is_file() && python.is_file() {
        return Ok(python);
    }

    println!("Preparando Python {PYTHON_VERSION} (solo la primera vez)...");
    fs::create_dir_all(&base)?;
    // Se extrae en una carpeta aparte y se renombra al final: si dos programas se abren a la vez,
    // ninguno ve una extracción a medias.
    let temporal = base.join(format!(".extrayendo-{}-{}", std::process::id(), marca_tiempo()));
    let resultado = extraer(&temporal).and_then(|_| {
        for intento in 0..2 {
            match fs::rename(&temporal, &destino) {
                Ok(()) => return Ok(()),
                Err(_) if destino.join(MARCA).is_file() => return Ok(()), // otro proceso ganó
                Err(e) if intento == 1 => return Err(e),
                Err(_) => {
                    // Quedó una carpeta incompleta (p. ej. borrada a medias): se reemplaza.
                    let _ = fs::remove_dir_all(&destino);
                }
            }
        }
        Ok(())
    });
    let _ = fs::remove_dir_all(&temporal);
    resultado?;
    if !python.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("no se encontró {}", python.display()),
        ));
    }
    println!();
    Ok(python)
}

fn extraer(carpeta: &Path) -> io::Result<()> {
    let mut zip = zip::ZipArchive::new(Cursor::new(PYTHON_ZIP)).map_err(io::Error::other)?;
    fs::create_dir_all(carpeta)?;
    for i in 0..zip.len() {
        let mut entrada = zip.by_index(i).map_err(io::Error::other)?;
        let Some(relativa) = entrada.enclosed_name() else { continue };
        let ruta = carpeta.join(relativa);
        if entrada.is_dir() {
            fs::create_dir_all(&ruta)?;
            continue;
        }
        if let Some(padre) = ruta.parent() {
            fs::create_dir_all(padre)?;
        }
        let mut archivo = io::BufWriter::new(fs::File::create(&ruta)?);
        io::copy(&mut entrada, &mut archivo)?;
        archivo.flush()?;
    }
    fs::write(carpeta.join(MARCA), format!("Python {PYTHON_VERSION}\n"))
}

/// Nombre de archivo seguro para Windows a partir del nombre del programa.
fn nombre_archivo(nombre: &str) -> String {
    let limpio: String = nombre
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '_' | '-' | ' ') {
                c
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let limpio = limpio.trim().to_string();
    if limpio.is_empty() {
        "programa".into()
    } else {
        limpio
    }
}

fn marca_tiempo() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn pausa() {
    print!("\nPresiona Enter para salir...");
    let _ = io::stdout().flush();
    let mut linea = String::new();
    let _ = io::stdin().lock().read_line(&mut linea);
}

#[cfg(windows)]
mod consola {
    use std::sync::atomic::{AtomicU32, Ordering};

    const CP_UTF8: u32 = 65001;
    const CTRL_C_EVENT: u32 = 0;
    const CTRL_BREAK_EVENT: u32 = 1;
    static CP_SALIDA: AtomicU32 = AtomicU32::new(0);
    static CP_ENTRADA: AtomicU32 = AtomicU32::new(0);

    #[link(name = "kernel32")]
    extern "system" {
        fn GetConsoleOutputCP() -> u32;
        fn GetConsoleCP() -> u32;
        fn SetConsoleOutputCP(cp: u32) -> i32;
        fn SetConsoleCP(cp: u32) -> i32;
        fn SetConsoleTitleW(titulo: *const u16) -> i32;
        fn SetConsoleCtrlHandler(manejador: Option<unsafe extern "system" fn(u32) -> i32>, agregar: i32) -> i32;
    }

    /// Ctrl+C detiene el programa de Python (KeyboardInterrupt), no al lanzador: así se alcanza a
    /// leer el error y la ventana espera Enter. (Un manejador, a diferencia de ignorar Ctrl+C,
    /// no se hereda al proceso hijo.)
    unsafe extern "system" fn manejador(evento: u32) -> i32 {
        (evento == CTRL_C_EVENT || evento == CTRL_BREAK_EVENT) as i32
    }

    pub fn preparar() {
        unsafe {
            CP_SALIDA.store(GetConsoleOutputCP(), Ordering::Relaxed);
            CP_ENTRADA.store(GetConsoleCP(), Ordering::Relaxed);
            SetConsoleOutputCP(CP_UTF8);
            SetConsoleCP(CP_UTF8);
            SetConsoleCtrlHandler(Some(manejador), 1);
        }
    }

    pub fn restaurar() {
        unsafe {
            let (s, e) = (CP_SALIDA.load(Ordering::Relaxed), CP_ENTRADA.load(Ordering::Relaxed));
            if s != 0 {
                SetConsoleOutputCP(s);
            }
            if e != 0 {
                SetConsoleCP(e);
            }
        }
    }

    pub fn titulo(texto: &str) {
        let anchos: Vec<u16> = texto.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            SetConsoleTitleW(anchos.as_ptr());
        }
    }
}

#[cfg(not(windows))]
mod consola {
    pub fn preparar() {}
    pub fn restaurar() {}
    pub fn titulo(_: &str) {}
}

#[cfg(test)]
mod pruebas {
    use super::nombre_archivo;

    #[test]
    fn nombres_de_archivo() {
        assert_eq!(nombre_archivo("Mi cálculo"), "Mi cálculo");
        assert_eq!(nombre_archivo("a/b:c*?"), "a_b_c__");
        assert_eq!(nombre_archivo("   "), "programa");
    }
}
