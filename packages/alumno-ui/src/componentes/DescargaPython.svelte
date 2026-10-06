<script lang="ts">
  // Pregunta antes de descargar Python (Pyodide) con datos móviles. Solo aparece cuando algo lo
  // necesita (Ejecutar o Probar) y Python aún no está guardado en el equipo.
  import { app, aprobarDescargaPython, esperarWifiPython, TAMANO_PYTHON } from "../lib/app.svelte";
</script>

{#if app.pythonEnEspera}
  <div class="aviso descarga" role="group" aria-label="Descargar Python" data-descarga-python>
    <span>📶 Para ejecutar tu programa hay que descargar Python ({TAMANO_PYTHON}, solo una vez) y estás con datos móviles.</span>
    <span class="botones">
      <button class="primario chico" onclick={aprobarDescargaPython}>Descargar Python ({TAMANO_PYTHON}) con datos móviles</button>
      <button class="chico" onclick={esperarWifiPython}>Esperar a Wi‑Fi</button>
    </span>
  </div>
{/if}

<style>
  .descarga {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.9em;
    margin: 0 0 0.4rem;
  }
  .botones {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>
