# Diseño técnico

## 1. Objetivo y decisiones

- Una sola **app web (PWA)** para alumnos y profesor, publicada como archivos estáticos en
  **GitHub Pages**.
- **Un profesor**, que crea a los alumnos y les genera contraseñas temporales; el alumno la
  cambia en su primer acceso.
- El alumno trabaja **sin conexión**; su avance se sincroniza solo al volver la red. El profesor
  lo ve en línea, en tiempo real.
- **Costo $0**: Firebase en el plan Spark (Auth + Firestore) y GitHub Pages.
- Sin servidor propio ni funciones en la nube: todo lo hace el navegador, y la seguridad la dan
  las reglas de Firestore.

## 2. Arquitectura

```
Navegador (PWA, apps/alumno-web)
 ├─ service worker (sw.js): caché de la app y de Pyodide; agrega COOP/COEP (SharedArrayBuffer)
 ├─ pantalla de acceso común (número de control → alumno; correo → profesor)
 ├─ área del alumno  (@rlp/alumno-ui + backend-firebase.ts)
 │    editor (@rlp/editor) · Python en un worker (@rlp/python-worker, Pyodide)
 └─ área del profesor (src/rol/profesor, import() solo si entra el profesor)
          │
          ▼  @rlp/nube (Firebase JS SDK)
Firebase Auth (correo/contraseña)  ·  Firestore (caché persistente, cola de escrituras sin conexión)
```

- **Sin conexión**: Auth guarda la sesión en IndexedDB y Firestore usa
  `persistentLocalCache` con varias pestañas. Las escrituras se encolan y se envían al volver la
  red. El primer inicio de sesión sí requiere conexión.
- **Aislamiento**: GitHub Pages no permite encabezados; el service worker agrega
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` a cada respuesta, así hay
  `SharedArrayBuffer` y `input()` síncrono en el worker de Python. La primera visita se recarga
  una vez a través del service worker.
- **Ruta base**: relativa (`./`) por defecto; el workflow de Pages compila con
  `RLP_BASE=/<repositorio>/`. El service worker y el manifiesto usan rutas relativas a su
  ubicación, así que funcionan en cualquier subcarpeta.
- **Programas `.exe`**: el lanzador de Windows (`lanzador/`, Rust) se publica en
  `lanzador/rlp-lanzador.exe` y la página lo usa para armar el `.exe` del alumno (sección 10).
- **Área del profesor**: un archivo aparte (`assets/area-profesor-*.js`, con el curso con
  soluciones) que el service worker no guarda por adelantado en los equipos de los alumnos.

## 3. Modelo de datos (Firestore)

Definido en `packages/nube/src/modelo.ts`. Los tiempos son milisegundos (`Date.now()`).

```
config/app                               { profesorUid, correo, creado }          un solo profesor
alumnos/{alumnoId}                       { nombre, control, grupo, uidActual, correo, alias[],
                                           debeCambiarClave, creado, ultimaSync }
alumnos/{alumnoId}/actividades/{act}     { codigo, completada, pasadas, total, puntos, intentos,
                                           respuesta, pistas, actualizado, nota?, ediciones?,
                                           edicionesTruncadas? }
alumnos/{alumnoId}/resumen/contadores    { global, por_actividad, actualizado,
                                           avance: { act: {completada, puntos, pasadas, total,
                                                           intentos, actualizado} },
                                           notas:  { act: {calificacion, comentario, actualizado} } }
usuarios/{uid}                           { alumnoId }        uid de Auth → alumno (estable)
grupos/{grupoId}                         { nombre, politicas: { pegado: "bloquear"|"propio",
                                                                registrarSalidas } }
logins/{control}                         { correo }          público: correo vigente del alumno
```

- **`ediciones`**: historial de edición para la reproducción. Cada elemento es un lote en JSON
  `{t0, ops: [dt, desde, hasta, insertado, origen][], base?}` (Firestore no admite arreglos
  anidados), agregado con `arrayUnion`. `base` es el texto de partida (primer lote de cada sesión
  o tras reiniciar). Pasado ~700 000 caracteres ya no se agrega (`edicionesTruncadas`), para no
  llegar al límite de 1 MB por documento.
- **`resumen/contadores`**: contadores antitrampa (sumados con `increment()`), el **resumen de
  avance** por actividad y una copia de las **notas**. Es lo único que lee el tablero, así abrirlo
  cuesta ~2 lecturas por alumno en lugar de una por actividad.
- **`nota`**: la escribe el profesor en la actividad (el alumno la ve) y en `resumen.notas`.

## 4. Cuentas

- **Alumno**: número de control → correo sintético `<control>@alumnos.rlp.local`
  (`logins/{control}` da el vigente). `usuarios/{uid}` da el `alumnoId`.
- **Alta**: el profesor crea la cuenta con una **segunda instancia** de Firebase
  (`initializeApp(cfg, "secundaria")`) para no cerrar su propia sesión; la contraseña temporal es
  legible (`gato-4821`).
- **Restablecer** en Spark (sin Admin SDK): se crea una cuenta nueva `<control>+r{n}@…`, se
  apunta `usuarios/{nuevoUid}`, `alumnos/{id}.uidActual` y `logins/{control}` a ella y se borra
  `usuarios/{viejoUid}`. El avance no se mueve porque cuelga de `alumnoId`.
- **Baja**: borra los documentos del alumno; la cuenta de Auth queda huérfana sin acceso (desde el
  navegador no se puede borrar otra cuenta).
- **Primer acceso**: con `debeCambiarClave` se pide la contraseña nueva (`updatePassword`).
- **Profesor**: la primera cuenta que crea `config/app` (una sola vez; las reglas impiden
  sobrescribirlo).

## 5. Reglas (`firestore.rules`)

- El profesor (`request.auth.uid == config/app.profesorUid`) lee y escribe todo, incluidas las
  consultas `collectionGroup("resumen")` y `collectionGroup("actividades")`.
- Cada alumno lee y escribe solo `alumnos/{suId}/**` (`suId` = `usuarios/{uid}.alumnoId`), sin
  poder escribir `nota`/`notas` ni borrar. De su documento solo puede cambiar
  `debeCambiarClave` (a `false`) y `ultimaSync`.
- `logins/{control}` y `config/app` son legibles sin sesión.

Se prueban con `@firebase/rules-unit-testing` contra el emulador (`pnpm test:reglas`).

## 6. Sincronización del alumno (`apps/alumno-web/src/backend-firebase.ts`)

La interfaz nunca espera al servidor: cada cambio se aplica en memoria y se escribe con
`setDoc(..., {merge: true})` sin `await`. Para ahorrar escrituras:

| Qué | Cuándo se escribe |
| --- | --- |
| Código e historial (`ediciones`) | cada ~30 s mientras escribe; al probar, reiniciar, cambiar de actividad, ocultar la ventana, cerrar o volver la red |
| Pruebas / respuestas | al momento |
| Contadores y resumen de avance | cada ~60 s; al completar una actividad, al momento |
| `ultimaSync` | a lo más cada 5 min, con todo enviado |

El indicador ("Sincronizado", "Sincronizando…", "Sin conexión") sigue `waitForPendingWrites` y
`navigator.onLine`. Los cambios que llegan de otro equipo o del profesor (notas, grupo,
contraseña restablecida) se reciben con `onSnapshot`; `progreso.fusionar` combina sin perder
avance (completada y puntos nunca bajan). La lógica de completar e intentos está en
`packages/alumno-ui/src/lib/progreso.ts` (con pruebas).

## 7. Área del profesor (`apps/alumno-web/src/rol/profesor`)

- `lib/datos.ts`: interfaz de datos; `datos-firebase.ts` (Firestore) y `datos-simulado.ts`
  (memoria, para desarrollo y pruebas con `?simulado`).
- **Tablero**: `onSnapshot(alumnos)` + `onSnapshot(collectionGroup("resumen"))`.
- **Detalle**: `onSnapshot` de la actividad elegida (1 lectura al abrirla).
- `lib/linea.ts`: convierte los lotes de `ediciones` en la línea de tiempo del Reproductor
  (tramos por sesión, marcas de pegado y reinicio), verifica que el código guardado se
  reconstruya y calcula el ritmo de escritura (ráfagas de más de 12 caracteres/s sostenidas 5 s).
- `lib/nivel.ts`: semáforo a partir de los contadores (rojo: inserciones sospechosas o ≥ 5
  intentos de pegar; amarillo: algún intento de pegar, mucho tiempo fuera o ráfagas).
- `lib/csv.ts` / `lib/informes.ts`: importar listas de alumnos, exportar avance y credenciales,
  hoja de tarjetas para imprimir.
- Volver a correr las pruebas usa el mismo worker de Pyodide que el alumno.

## 8. Límites conocidos

- La app no puede impedir al 100 % las trampas: un alumno con conocimientos podría escribir
  directamente en su parte de Firestore. La reproducción y el semáforo ayudan a detectarlo.
- Las soluciones de referencia viajan en el archivo del área del profesor y están en el
  repositorio; no son secretas.
- Varios grupos grandes el mismo día pueden acercarse a las 20 000 escrituras diarias de Spark
  (ver la guía de instalación).

## 9. Pruebas

- **Vitest** (`pnpm test`): progreso, editor (pegado, operaciones), modelo de `@rlp/nube`, y del
  área del profesor el semáforo, la línea de tiempo, el ritmo, CSV e informes.
- **Reglas y cuentas** (`pnpm test:reglas`): emuladores de Auth y Firestore.
- **Playwright** (`pnpm e2e`): banco del editor y de Python; la app con datos simulados (alumno y
  profesor), incluido "Crear programa .exe" con un lanzador falso (revisa el remolque del archivo
  descargado y que la segunda vez use la caché).
- **Lanzador** (`cd lanzador && cargo test`, `pnpm lanzador -- --probar`): formato del remolque y
  un `.exe` real ejecutado con entrada por tubería (en CI, en Windows).
- **Playwright + emuladores** (`pnpm e2e:emuladores`): la app compilada servida bajo `/rlp/` como
  en Pages; instalación sin conexión del alumno, y el flujo completo profesor ↔ alumno.

## 10. Programas `.exe` (fase 2)

PyInstaller no corre en un navegador, así que se usa un **lanzador precompilado** al que la app le
pega el código del alumno. Todo en el navegador, sin servidor.

**Lanzador** (`lanzador/`, Rust, proyecto independiente): un `.exe` de consola x86_64 que incluye
(`include_bytes!`) el Python "embeddable" oficial de Windows. La versión, la URL y el SHA-256
están fijados en `lanzador/python.json`; `scripts/lanzador.mjs` lo descarga y verifica, y
`build.rs` vuelve a verificar la huella (el `.zip` no está en git). Compilado con `opt-level="z"`,
LTO, `panic=abort`, `strip` y CRT estático (no necesita `vcruntime140.dll`): ~430 KB de código más
~12.6 MB de Python, unos 13 MB en total. Al abrirse:

1. Pone la consola en UTF-8 (`SetConsoleOutputCP`/`SetConsoleCP` 65001; los restaura al salir) y
   el título con el nombre del programa.
2. Lee el final de su propio archivo (`current_exe`) buscando el remolque:
   `[nombre UTF-8][len u32 LE]["RLPNOMBR"]` (opcional) `[script UTF-8][len u32 LE]["RLPSCRPT"]`.
   Sin remolque, explica qué es y termina.
3. Extrae Python una sola vez a `%LOCALAPPDATA%\RealLearningProgramming\python-<versión>-<sha8>`:
   en una carpeta temporal que se renombra al final (dos programas abiertos a la vez no ven una
   extracción a medias); un archivo marca la extracción completa.
4. Escribe el script en `%TEMP%\rlp-<pid>-…\<nombre>.py` y corre `python.exe` en la misma consola
   (`input()` funciona), con `PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8` y la carpeta del `.exe` como
   carpeta de trabajo. Ctrl+C llega a Python (KeyboardInterrupt) y no cierra el lanzador.
5. Muestra el error (traceback) si lo hubo y espera **"Presiona Enter para salir..."**; devuelve
   el código de salida de Python.

**App** (`packages/alumno-ui/src/lib/ejecutable.ts`): `obtenerLanzador()` lee
`lanzador/lanzador.json` (versión, tamaño, SHA-256) y usa la copia de la caché `rlp-lanzador` si
coincide (o si no hay conexión); si no, lo descarga mostrando el avance, verifica el SHA-256 y lo
guarda. `armarRemolque()` arma los bytes del final (la misma prueba de bytes en Vitest y en
`cargo test`) y la descarga es un `Blob([lanzador, remolque])` con `<a download>`. Cada `.exe`
suma el evento `ejecutable` (contador `ejecutables`).

**Service worker**: el lanzador no entra en la precarga (pesa ~13 MB y la mayoría de los alumnos
no lo usa) y las rutas `/lanzador/` no pasan por el service worker; la caché `rlp-lanzador` se
conserva al actualizar la app. Al ser del mismo origen, COOP/COEP no lo bloquean.

**CI**: el job "Compilar el lanzador de Windows" (`windows-latest`, MSVC) corre `cargo test`,
compila, arma un `.exe` de ejemplo con `input()` y acentos, lo ejecuta y revisa la salida, y pasa
`rlp-lanzador.exe` + `lanzador.json` al job que compila el sitio.

**Límites**: solo Windows 10/11 x64; solo la biblioteca estándar (sin `pip`, sin `tkinter`); sin
firma (SmartScreen, posibles falsos positivos de antivirus; firmarlo requiere un certificado de
pago); la primera ejecución extrae ~25 MB.
