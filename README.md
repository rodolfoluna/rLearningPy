# RealLearningProgramming

App web para aprender y enseñar programación en Python, en español. Es **una sola app** (PWA
instalable) con dos áreas:

- **Alumnos**: curso con 8 unidades, 42 lecciones y 118 actividades (fundamentos, condiciones,
  ciclos, funciones, cadenas, listas y 8 proyectos integradores), editor con el pegado bloqueado,
  consola con `input()`, pruebas automáticas, errores explicados en español y pistas. **Funciona
  sin conexión**: el avance se guarda en el equipo y se sincroniza solo al volver la red.
- **Profesor**: tablero en tiempo real (avance, puntos, última sincronización y semáforo de
  alertas por intentos de pegar, inserciones sospechosas y tiempo fuera de la ventana), detalle
  por alumno con su código, **reproducción de cómo lo escribió** tecla a tecla, volver a correr
  las pruebas, calificaciones y comentarios que el alumno ve en su actividad, alta de alumnos
  (uno por uno o en lote) con contraseñas temporales para imprimir, restablecer contraseñas,
  grupos con su política de pegado y exportación a CSV.

Todos entran por la misma pantalla: el alumno con su **número de control**, el profesor con su
**correo**.

Costo: **$0**. Los archivos (la app y Python en WebAssembly) se publican en **GitHub Pages** y
los datos viven en **Firebase** (Authentication + Firestore) en el plan gratuito **Spark**, sin
tarjeta. Alcanza para un profesor con varios grupos de ~35 alumnos (ver
[límites del plan gratuito](docs/INSTALACION.md#límites-del-plan-gratuito)).

## Documentación

- [Guía de instalación](docs/INSTALACION.md): crear el proyecto de Firebase, publicar en GitHub
  Pages, configurar al profesor y dar de alta a los alumnos, paso a paso.
- [Manual del profesor](docs/MANUAL-PROFESOR.md)
- [Manual del alumno](docs/MANUAL-ALUMNO.md)
- [Diseño técnico](docs/DISENO.md): arquitectura, modelo de datos, reglas y sincronización.

## Stack

Svelte 5 + TypeScript · Vite · CodeMirror 6 · Pyodide (CPython en WebAssembly, en un worker) ·
Firebase Auth + Firestore (caché persistente sin conexión) · service worker propio (sin
conexión y página aislada para `input()`) · Vitest · Playwright · Firebase Emulator Suite.

```
apps/alumno-web          la app (PWA): acceso, área del alumno y área del profesor (src/rol/profesor)
packages/alumno-ui       interfaz del alumno (Svelte)
packages/nube            cliente de Firebase: modelo de datos, sesión, operaciones del profesor
packages/editor          CodeMirror 6 con bloqueo de pegado e historial de edición
packages/python-worker   Pyodide en un worker: ejecutar, input(), pruebas, errores en español
packages/curso           curso compilado (JSON) y sus tipos
packages/ui-comun        componentes y estilos compartidos
curso/                   contenido del curso (Markdown + YAML + Python)
firestore.rules          reglas de seguridad de Firestore (firestore.indexes.json: índices)
tests/                   reglas (emuladores), e2e (Playwright) y banco de pruebas del editor/Python
```

## Desarrollo

Requisitos: Node 22 + pnpm 10, Python 3 (para validar el curso) y, para los emuladores de
Firebase, Java 21 o superior.

```bash
pnpm install
pnpm dev            # compila el curso, copia Pyodide y abre http://localhost:1422
```

Sin configuración de Firebase, `pnpm dev` usa **datos simulados** en memoria (también con
`?simulado`):

- alumno: cualquier número de control con la contraseña `gato-1234`;
- profesor: `profesor@demo.local` / `profesor-demo` (con alumnos de ejemplo).

Con Firebase de verdad, copia `apps/alumno-web/.env.example` como `apps/alumno-web/.env.local` y
llena los valores. Con los emuladores locales: `pnpm emuladores` en una terminal y en otra
`pnpm --filter @rlp/alumno-web dev --mode emulador`.

## Pruebas

```bash
pnpm test                  # Vitest: progreso, editor, modelo, tablero/CSV/reproducción del profesor
pnpm check                 # svelte-check
pnpm test:reglas           # reglas de Firestore y flujo de cuentas contra los emuladores (Java 21+)
pnpm e2e                   # Playwright: banco del editor/Python y la app con datos simulados
pnpm e2e:emuladores        # Playwright con la app compilada bajo /rlp/ y los emuladores:
                           #   profesor crea alumno → el alumno entra, cambia su contraseña y
                           #   resuelve sin conexión → el tablero muestra el avance → calificar →
                           #   restablecer contraseña
python3 scripts/validar_curso.py        # soluciones del curso en CPython
node scripts/validar-curso-pyodide.mjs  # ... y en Pyodide
```

En Windows, si Java no está en el `PATH`, define `JAVA_HOME` (por ejemplo, el JBR de Android
Studio: `C:\Program Files\Android\Android Studio\jbr`).

## Compilar y publicar

```bash
pnpm build                                   # apps/alumno-web/dist (ruta relativa: sirve en cualquier carpeta)
RLP_BASE=/mi-repo/ pnpm build                # con ruta absoluta, como en GitHub Pages
pnpm desplegar:reglas --project <id>         # publica firestore.rules y los índices
```

En GitHub, el workflow **Publicar la app web** (`.github/workflows/build-web.yml`) compila con los
secretos `VITE_FIREBASE_*` y publica en Pages en cada push a `main`. **Publicar reglas de
Firestore** (`firebase-reglas.yml`) publica las reglas si configuras una cuenta de servicio. Todo
está explicado en la [guía de instalación](docs/INSTALACION.md).

## Curso

El contenido está en `curso/`. Para agregar una actividad, edita el `actividades.yaml` de la
lección, ejecuta `pnpm curso` y valida con `python3 scripts/validar_curso.py`.

## Pendiente (fase 2)

Crear un **programa `.exe`** desde el navegador: un lanzador precompilado con Python embebido al
que la app le agrega el código del alumno, sin servidor y sin conexión. Aún no está hecho.
