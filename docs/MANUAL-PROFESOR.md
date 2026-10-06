# Manual del profesor

La app tiene una sola dirección para todos. Tú entras con tu **correo** y tu contraseña en la
misma pantalla que tus alumnos; la app te lleva al área del profesor. Si aún no configuras la app,
sigue la [guía de instalación](INSTALACION.md).

Arriba están las tres secciones (**📊 Tablero**, **🎓 Alumnos**, **👥 Grupos**), el selector de
**Grupo** (filtra el tablero, la lista de alumnos y las exportaciones) y **Cerrar sesión**.

## 1. Grupos

**👥 Grupos → ＋ Nuevo grupo**:

- **Nombre** del grupo.
- **Pegar en el editor**:
  - **Bloquear siempre** (recomendado): no se puede pegar nada en el editor, en la consola ni en
    las respuestas.
  - **Permitir solo lo copiado dentro de la app**: el alumno puede pegar lo que él mismo copió de
    su código; pegar desde fuera sigue bloqueado. Cada pegado se cuenta.
- **Contar las salidas de la ventana**: registra cuántas veces y cuánto tiempo el alumno salió
  de la app.

Los cambios llegan a los alumnos al momento (o cuando recuperen la conexión). **✏ Editar** cambia
el nombre o las políticas; **🗑 Borrar** deja a sus alumnos sin grupo (con el pegado bloqueado),
sin borrar su avance.

## 2. Alumnos

### Dar de alta

En **🎓 Alumnos → Agregar alumnos** elige el **grupo** y:

- **Uno por uno**: número de control y nombre completo → **Crear alumno**.
- **Varios a la vez**: abre "Varios a la vez" y pega la lista, una línea por alumno:

  ```
  21340500,Karla Pérez López
  21340501,Luis Gómez Ruiz
  ```

  También sirve con `;` o con tabulador (copiar dos columnas de Excel), y puedes **📄 Subir CSV**.
  Un encabezado en la primera línea se ignora. La app avisa de líneas con errores (número de
  control con espacios o símbolos, nombre vacío, repetidos) antes de crear.

El número de control solo admite letras, números, `-` y `_`, y es el usuario del alumno: no se
puede cambiar después (si está mal, da de baja al alumno y créalo de nuevo).

### Credenciales

Al crear (o restablecer) aparece la tabla de **credenciales** con la contraseña temporal de cada
alumno, como `gato-4821`:

- **⬇ Descargar CSV**: para guardarla o abrirla en Excel.
- **🖨 Imprimir**: una hoja de tarjetas recortables con nombre, grupo, número de control,
  contraseña temporal y la dirección de la app.

**Las contraseñas temporales no se guardan**: descárgalas o imprímelas antes de cerrar la tabla.
Al entrar por primera vez, cada alumno debe elegir una contraseña nueva.

### Restablecer una contraseña

Si un alumno olvida su contraseña: **🎓 Alumnos → 🔑 Restablecer contraseña** (o el mismo botón
en su detalle). Se genera una contraseña temporal nueva, la anterior deja de servir y su avance
no cambia. Si el alumno tenía la app abierta con la cuenta anterior, debe cerrar sesión y entrar
con la nueva.

### Editar y dar de baja

- **✏ Editar**: nombre y grupo.
- **🗑 Dar de baja**: borra al alumno y todo su avance; ya no puede entrar. No se puede deshacer.

## 3. Tablero

Muestra a los alumnos del grupo elegido y **se actualiza solo**:

- **Resumen**: número de alumnos, cuántos se conectaron en las últimas 24 h, avance promedio, y
  cuántos están en amarillo y en rojo.
- Por alumno: grupo, **alerta**, **avance** (actividades completadas de 118 y porcentaje),
  **puntos**, tiempo de práctica, ejecuciones, intentos de pegar, salidas de la ventana y **última
  sincronización**. "no ha entrado" indica que aún tiene su contraseña temporal.
- Haz clic en el título de una columna para **ordenar** (otra vez para invertir).
- **Ver mapa de actividades**: una celda por actividad (verde: completada; color: empezada).
- **Buscar** por nombre o número de control.

El avance llega cuando el alumno termina una actividad (al momento si tiene red) y los contadores
cada minuto mientras trabaja. Un alumno que trabajó sin conexión aparece al día en cuanto su
equipo recupera la red y abre la app.

**Celulares con datos móviles:** para cuidar el saldo de los alumnos, en Android la app envía
sola con Wi‑Fi y, con datos móviles, espera a que el alumno toque **Enviar ahora** (ver el
manual del alumno). Su avance puede llegar más tarde: se guarda en el teléfono y llega al
conectarse a Wi‑Fi. Un **📶** junto a "última sincronización" indica que su último envío fue con
datos móviles. Si necesitas el avance en clase, pide que toquen "Enviar ahora" o que usen el
Wi‑Fi de la escuela.

### Semáforo de alertas

| Color | Significa |
| --- | --- |
| 🟢 Sin alertas | Nada fuera de lo normal. |
| 🟡 Revisar | Algún intento de pegar, mucho tiempo fuera de la ventana (más de 10 min y más de una cuarta parte de su tiempo de práctica) o ráfagas de escritura demasiado rápidas. |
| 🔴 Alerta | Inserciones sospechosas (texto que apareció en el editor sin teclearlo, por ejemplo con otra herramienta) o 5 o más intentos de pegar. |

Pasa el puntero sobre el semáforo para ver los motivos. Es una señal para revisar, no una prueba:
abre el detalle y mira la reproducción.

### Exportar a CSV

- **⬇ CSV de avance**: una fila por alumno con completadas, porcentaje, puntos, alerta y una
  columna por actividad con los puntos obtenidos (vacía si no la ha abierto, 0 si la intentó sin
  completarla).
- **⬇ CSV detallado**: una fila por alumno y actividad con pruebas pasadas, puntos, intentos,
  minutos, intentos de pegar, tu calificación y tu comentario.

Ambos exportan los alumnos visibles (grupo y búsqueda) y se abren en Excel con acentos correctos.

## 4. Detalle de un alumno

Haz clic en un alumno del tablero.

- **Actividades**: el curso por unidad y lección (✓ completada, ● empezada, ○ sin abrir; 🚫 con
  intentos de pegar; tu calificación). Al elegir una actividad ves:
  - su estado, tiempo, ejecuciones, intentos, pistas, copias, intentos de pegar y salidas;
  - el **código** guardado (actividades de código) o la **respuesta** (predicción y opción
    múltiple, junto a la respuesta correcta);
  - si el código **se reconstruye tecla a tecla** desde su historial de escritura;
  - **⏯ Ver cómo lo escribió**: reproduce la escritura con velocidad ajustable, "saltar pausas",
    una barra para ir a cualquier momento y marcas de pegados y reinicios;
  - **✔ Volver a correr las pruebas** con el código del alumno (en tu navegador);
  - **Ver enunciado y solución de referencia**;
  - **Calificación** y **comentario**: al guardar, el alumno los ve en esa actividad ("Tu
    profesor"). Deja ambos vacíos y guarda para borrarlos.
- **Estadísticas**: todos los contadores del alumno.
- **🔑 Restablecer contraseña**.

## 5. Uso de la cuota gratuita

El tablero está pensado para gastar poco: lee un documento por alumno y después solo lo que
cambia; el código de una actividad se lee solo al abrirla. Puedes dejarlo abierto durante la
clase. Si te preocupa la cuota, revisa **Firestore → Uso** en la consola de Firebase (ver
[límites](INSTALACION.md#límites-del-plan-gratuito)).

## 6. Tu cuenta

- Para cambiar tu contraseña u olvidarla: Firebase → Authentication → Usuarios → tu cuenta →
  **Restablecer contraseña** (te llega un correo).
- Las soluciones de referencia viajan dentro de la app (solo se descargan al entrar como
  profesor), pero cualquiera que conozca la dirección del archivo podría verlas, y también están
  en el repositorio público (`curso/`). No uses la app para exámenes cuya solución deba ser
  secreta.

## 7. Programas `.exe` de los alumnos

En cada actividad de código, en computadora, el alumno puede usar **⚙ Crear programa .exe** para descargar su
programa como un `.exe` de Windows que se abre sin instalar Python (ver el
[manual del alumno](MANUAL-ALUMNO.md#8-crear-un-programa-exe)). Se arma en el navegador, sin
servidor; el contador **Programas .exe** del detalle del alumno dice cuántos ha creado.

- Solo **Windows 10 u 11 de 64 bits** (x64). El botón solo aparece en computadoras con pantalla
  grande (no en celulares ni tabletas); se puede crear desde una Mac, Linux o Chromebook, pero
  solo se abre en Windows.
- Solo la **biblioteca estándar** de Python: sin paquetes de `pip`. Tampoco trae `tkinter` ni
  `turtle` (el Python "embeddable" de Windows no los incluye).
- **No está firmado**: Windows SmartScreen muestra "Windows protegió tu PC"; hay que elegir
  **Más información → Ejecutar de todas formas**. Algunos antivirus pueden marcarlo por error.
- La primera vez que se abre en una computadora extrae Python (unos 25 MB) a
  `%LOCALAPPDATA%\RealLearningProgramming\`; las siguientes veces abre al instante.

En el laboratorio, si el antivirus de la escuela los bloquea, se puede agregar como excepción la
carpeta de descargas de los alumnos o `%LOCALAPPDATA%\RealLearningProgramming`. Firmar el
lanzador (para quitar el aviso de SmartScreen) requiere un certificado de firma de código de pago.
