<script lang="ts">
  // Área del profesor (etapa 3): tablero, detalle por alumno, gestión de alumnos y grupos.
  // Se carga con import() desde main.ts solo cuando entra el profesor. Las operaciones de datos
  // ya están en @rlp/nube (crearAlumno, restablecerAlumno, guardarGrupo, eliminarAlumno…).
  let { salir }: { salir: () => Promise<void> } = $props();
</script>

<main class="centro">
  <div class="tarjeta" style="max-width: 560px" data-area-profesor>
    <h2>Área del profesor</h2>
    <p class="suave">
      Entraste como profesor. El tablero de avances y la gestión de alumnos y grupos están en construcción.
    </p>
    <div class="fila">
      <span class="espaciador"></span>
      <button onclick={salir}>Cerrar sesión</button>
    </div>
  </div>
</main>
