# Guía de instalación

Esta guía deja la app funcionando en internet, gratis, para un profesor y sus grupos. Se hace una
sola vez y toma alrededor de una hora. No necesitas tarjeta de crédito.

Vas a usar dos servicios:

- **Firebase** (de Google), en el plan gratuito **Spark**: las cuentas (Authentication) y los
  datos (Firestore: alumnos, grupos, avance).
- **GitHub Pages**: publica la app (los archivos, incluido Python en WebAssembly).

Al final tendrás una dirección como `https://<tu-usuario>.github.io/<repositorio>/` que abren
tú y tus alumnos.

## Antes de empezar

- Una cuenta de Google (para Firebase) y una de GitHub.
- Una copia de este repositorio en tu cuenta de GitHub: botón **Fork** (o **Use this template**).
  Para publicar en Pages con una cuenta gratuita, el repositorio debe ser **público**.
- Opcional, para publicar las reglas desde tu computadora: Node 22 y pnpm 10
  (`npm install -g pnpm`).

## 1. Crear el proyecto de Firebase

1. Entra a <https://console.firebase.google.com> y elige **Crear un proyecto** (o "Agregar
   proyecto").
2. Ponle un nombre, por ejemplo `rlp-programacion`. Anota el **ID del proyecto** que aparece
   debajo del nombre (por ejemplo `rlp-programacion-1a2b3`): lo usarás varias veces.
3. Google Analytics no hace falta: puedes desactivarlo.
4. Al terminar, el proyecto queda en el plan **Spark** (gratuito). No lo cambies a Blaze.

## 2. Activar el inicio de sesión con correo y contraseña

1. En el menú de la izquierda: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → activa la primera opción
   (no hace falta "vínculo de correo electrónico") → **Guardar**.

Los alumnos no necesitan correo: la app convierte su número de control en una cuenta interna
(`<control>@alumnos.rlp.local`).

## 3. Crear la base de datos Firestore

1. **Compilación → Firestore Database → Crear base de datos**.
2. Edición **Standard**, ubicación cercana (por ejemplo `nam5` o `us-central1`; no se puede
   cambiar después).
3. Elige **Comenzar en modo de producción** (todo cerrado). Las reglas de la app se publican en
   el paso 7.

## 4. Registrar la app web y copiar su configuración

1. En **Configuración del proyecto** (el engrane junto a "Descripción general") → pestaña
   **General** → sección **Tus apps** → ícono **`</>`** (Web).
2. Ponle un apodo (por ejemplo `rlp-web`). **No** marques Firebase Hosting. **Registrar app**.
3. Firebase muestra un bloque `firebaseConfig`. Copia estos cuatro valores:

   | En `firebaseConfig` | Secreto de GitHub (paso 6)   |
   | ------------------- | ---------------------------- |
   | `apiKey`            | `VITE_FIREBASE_API_KEY`      |
   | `authDomain`        | `VITE_FIREBASE_AUTH_DOMAIN`  |
   | `projectId`         | `VITE_FIREBASE_PROJECT_ID`   |
   | `appId`             | `VITE_FIREBASE_APP_ID`       |

   Estos valores no son contraseñas: identifican tu proyecto y viajan dentro de la app. Lo que
   protege los datos son las reglas de Firestore (paso 7).

## 5. Autorizar el dominio de GitHub Pages

**Authentication → Configuración → Dominios autorizados → Agregar dominio** y escribe
`<tu-usuario>.github.io` (solo el dominio, sin `https://` ni el nombre del repositorio). Sin
esto, el inicio de sesión falla en la página publicada.

## 6. Configurar GitHub: secretos y Pages

En tu repositorio de GitHub:

1. **Settings → Secrets and variables → Actions → New repository secret**. Crea los cuatro
   secretos de la tabla del paso 4 (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) con sus valores.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions**: si GitHub pregunta, habilita los workflows del fork.
4. Publica: pestaña **Actions → Publicar la app web → Run workflow** (o haz cualquier cambio en
   `main`). Al terminar (unos 5 minutos), el paso "Publicar en GitHub Pages" muestra la dirección
   de la app.

La app se publica en `https://<tu-usuario>.github.io/<repositorio>/`. Si el repositorio se llama
`<tu-usuario>.github.io` o usas un dominio propio, se publica en la raíz. Para otra ruta, crea la
variable del repositorio `RLP_BASE` (Settings → Secrets and variables → Actions → Variables), por
ejemplo `/` o `/programacion/`.

Cada vez que se actualice `main`, la app se vuelve a publicar sola. Las apps abiertas muestran
"Hay una versión nueva" y se actualizan con un clic.

## 7. Publicar las reglas de seguridad de Firestore

Las reglas (`firestore.rules`) deciden quién puede leer y escribir cada dato: el profesor ve todo;
cada alumno solo su propio avance. **Sin este paso la app no funciona** (la base de datos está
cerrada). Elige una de dos formas.

### Opción A: desde tu computadora (más sencilla)

```bash
git clone https://github.com/<tu-usuario>/<repositorio>.git
cd <repositorio>
pnpm install
pnpm exec firebase login                       # abre el navegador para entrar con tu cuenta de Google
pnpm desplegar:reglas --project <id-del-proyecto>
```

Repite el último comando cada vez que cambien `firestore.rules` o `firestore.indexes.json`.

### Opción B: desde GitHub Actions

1. En Google Cloud (<https://console.cloud.google.com/iam-admin/serviceaccounts>, con tu
   proyecto elegido arriba) → **Crear cuenta de servicio** → nombre `reglas-firestore` → dale los
   roles **Firebase Rules Admin** y **Cloud Datastore Index Admin** → **Listo**.
2. En la cuenta creada → **Claves → Agregar clave → Crear clave nueva → JSON**. Se descarga un
   archivo.
3. En GitHub crea el secreto `FIREBASE_SERVICE_ACCOUNT` y pega **todo** el contenido del archivo.
   Después borra el archivo de tu computadora.
4. **Actions → Publicar reglas de Firestore → Run workflow**. A partir de ahí se publican solas
   cuando cambian en `main`.

## 8. Configurar la cuenta del profesor (una sola vez)

1. Abre la dirección de la app.
2. En la pantalla de acceso, abajo, elige **Configurar la app por primera vez (profesor)**.
3. Escribe tu correo real y una contraseña de al menos 8 caracteres → **Crear cuenta de
   profesor**.

Solo puede haber un profesor: en cuanto se crea, el enlace desaparece y las reglas impiden que
alguien más se registre como profesor. Desde ese momento entras con tu correo y tu contraseña en
la misma pantalla que los alumnos.

> Si olvidas tu contraseña de profesor: Firebase → Authentication → Usuarios → los tres puntos de
> tu cuenta → **Restablecer contraseña** (te llega un correo).

## 9. Crear grupos y dar de alta a los alumnos

Dentro del área del profesor:

1. **👥 Grupos → Nuevo grupo**: nombre (por ejemplo "Programación 1A") y la política de pegado
   (**Bloquear siempre** o **Permitir solo lo copiado dentro de la app**).
2. **🎓 Alumnos**: elige el grupo y
   - escribe número de control y nombre → **Crear alumno**, o
   - abre **Varios a la vez**, pega la lista (una línea por alumno: `21340500,Karla Pérez`; sirve
     copiar dos columnas de Excel) o **Sube un CSV** → **Crear N alumnos**.
3. Aparece la tabla de **credenciales** con la contraseña temporal de cada alumno. **Descárgala
   (CSV) o imprímela ahora** (🖨 imprime una tarjeta recortable por alumno): las contraseñas no se
   guardan en ningún lado. Si se pierde alguna, usa **Restablecer contraseña**.
4. Reparte las tarjetas. Cada alumno entra con su número de control y su contraseña temporal, y
   la app le pide elegir una nueva.

Detalles en el [manual del profesor](MANUAL-PROFESOR.md).

## Límites del plan gratuito

| Servicio | Límite gratuito | Uso esperado |
| --- | --- | --- |
| Firestore: lecturas | 50 000 por día | Abrir el tablero cuesta ~2 por alumno (70 con 35 alumnos) y luego ~1 por alumno activo por minuto. Cada alumno al entrar lee su avance (≤ 120). |
| Firestore: escrituras | 20 000 por día | Un alumno escribe ~1 vez cada 30–60 s mientras teclea, más al probar o terminar. 35 alumnos tecleando sin parar durante una clase de 2 h: hasta ~12 000. |
| Firestore: almacenamiento | 1 GiB | Un alumno con el curso completo ocupa unos pocos MB (el historial de escritura es lo más grande). |
| Authentication | Sin costo para correo y contraseña | Crear muchas cuentas seguidas desde la misma red puede frenarse por unos minutos (protección contra abuso): si falla una alta en lote, espera y vuelve a intentar las que faltaron. |
| GitHub Pages | ~100 GB de transferencia al mes, sitio ≤ 1 GB | Cada alumno descarga ~15 MB la primera vez (Python incluido) y después la app sale de su caché. |

Por eso la app se publica en **GitHub Pages y no en Firebase Hosting**: en Spark, Hosting solo
permite **360 MB de transferencia al día**; 35 alumnos descargando Python el primer día ya lo
superarían.

Si un día se acaba la cuota de Firestore, los alumnos siguen trabajando sin conexión (todo se
guarda en su equipo) y se sincroniza al día siguiente, cuando la cuota se reinicia. En la consola
de Firebase (**Firestore → Uso**) ves el consumo diario. Varios grupos grandes trabajando el mismo
día pueden acercarse al límite de escrituras.

## Problemas comunes

- **"auth/unauthorized-domain"** o el inicio de sesión no hace nada en la página publicada: falta
  el paso 5.
- **"Missing or insufficient permissions"** / la app no carga datos: falta publicar las reglas
  (paso 7) o se publicaron en otro proyecto (revisa `--project`).
- **El workflow falla en "Revisar la configuración de Firebase"**: faltan los secretos del paso 6.
- **La página publicada sale en blanco o sin estilos**: revisa la variable `RLP_BASE` (debe
  coincidir con la ruta de la dirección y terminar en `/`).
- **El enlace "Configurar la app por primera vez" no aparece**: ya hay un profesor configurado
  (documento `config/app` en Firestore). Si fue un error, bórralo desde la consola de Firestore y
  recarga la app.

## Pendiente (fase 2)

Generar un **programa `.exe`** con el código del alumno desde el navegador aún no está
disponible.
