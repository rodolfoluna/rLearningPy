<script lang="ts">
  import { onMount, type Component } from "svelte";
  import CambiarClave from "./componentes/CambiarClave.svelte";
  import Inicio from "./componentes/Inicio.svelte";
  import Principal from "./componentes/Principal.svelte";
  import { app, aplicarTema, cargarEstadoApp, entrarSesion, escucharNucleo, salir } from "./lib/app.svelte";
  import { backend } from "./lib/backend";
  import { opciones } from "./lib/opciones";
  import { mensajeError } from "@rlp/ui-comun";

  let errorFatal = $state("");
  let VistaProfesor: Component<{ salir: () => Promise<void> }> | null = $state(null);

  onMount(async () => {
    aplicarTema(app.tema);
    try {
      await opciones.alIniciar?.();
      await cargarEstadoApp();
      await escucharNucleo();
      const sesion = await (await backend()).reanudarSesion().catch(() => null);
      if (sesion) entrarSesion(sesion);
      else app.vista = "inicio";
      const fase = app.estadoApp?.autoprueba;
      if (fase && opciones.autoprueba) void opciones.autoprueba(fase);
    } catch (e) {
      errorFatal = mensajeError(e);
    }
  });

  $effect(() => {
    if (app.vista !== "profesor" || VistaProfesor) return;
    if (!opciones.vistaProfesor) {
      errorFatal = "Esta versión de la app no incluye el área del profesor.";
      return;
    }
    opciones.vistaProfesor().then(
      (c) => (VistaProfesor = c),
      (e) => (errorFatal = mensajeError(e)),
    );
  });
</script>

{#if errorFatal}
  <main class="centro">
    <div class="tarjeta" style="max-width: 560px">
      <h2>No se pudo iniciar la app</h2>
      <p class="error">{errorFatal}</p>
    </div>
  </main>
{:else if app.vista === "cargando"}
  <main class="centro"><p class="suave">Cargando…</p></main>
{:else if app.vista === "inicio"}
  <Inicio />
{:else if app.vista === "cambiar-clave"}
  <CambiarClave />
{:else if app.vista === "profesor"}
  {#if VistaProfesor}
    <VistaProfesor {salir} />
  {:else}
    <main class="centro"><p class="suave">Cargando el área del profesor…</p></main>
  {/if}
{:else}
  <Principal />
{/if}

{#if app.aviso}
  <div class="aviso-flotante" role="status">{app.aviso}</div>
{/if}
