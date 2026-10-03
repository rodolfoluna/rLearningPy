<script lang="ts">
  // Área del profesor: tablero en tiempo real, detalle por alumno, gestión de alumnos y grupos.
  // Se carga con import() desde main.ts solo cuando entra el profesor.
  import { onMount } from "svelte";
  import "./profesor.css";
  import Alumnos from "./componentes/Alumnos.svelte";
  import Credenciales from "./componentes/Credenciales.svelte";
  import Detalle from "./componentes/Detalle.svelte";
  import Grupos from "./componentes/Grupos.svelte";
  import Tablero from "./componentes/Tablero.svelte";
  import { datos } from "./lib/datos";
  import { conectar, prof } from "./lib/estado.svelte";

  let { salir }: { salir: () => Promise<void> } = $props();
  const correo = datos().correo();

  onMount(() => conectar());

  const enTablero = $derived(prof.vista.tipo === "tablero" || prof.vista.tipo === "detalle");
</script>

<div class="area-profesor" data-area-profesor>
  <header class="barra-profesor">
    <strong class="marca">🧑‍🏫 Profesor</strong>
    <nav class="fila" aria-label="Secciones">
      <button class:activa={enTablero} onclick={() => (prof.vista = { tipo: "tablero" })}>📊 Tablero</button>
      <button class:activa={prof.vista.tipo === "alumnos"} onclick={() => (prof.vista = { tipo: "alumnos" })}>🎓 Alumnos</button>
      <button class:activa={prof.vista.tipo === "grupos"} onclick={() => (prof.vista = { tipo: "grupos" })}>👥 Grupos</button>
    </nav>
    <span class="espaciador"></span>
    <label class="selector">
      <span class="suave">Grupo</span>
      <select bind:value={prof.grupoId} aria-label="Filtrar por grupo">
        <option value={null}>Todos</option>
        {#each prof.grupos as g (g.id)}
          <option value={g.id}>{g.nombre}</option>
        {/each}
        <option value="">Sin grupo</option>
      </select>
    </label>
    {#if correo}<span class="suave correo">{correo}</span>{/if}
    <button class="chico" onclick={salir}>Cerrar sesión</button>
  </header>
  <main class="contenido-profesor">
    {#if prof.error}
      <p class="error" style="margin: 1rem">{prof.error}</p>
    {/if}
    {#if prof.vista.tipo === "tablero"}
      <Tablero />
    {:else if prof.vista.tipo === "detalle"}
      {#key prof.vista.alumnoId}
        <Detalle alumnoId={prof.vista.alumnoId} />
      {/key}
    {:else if prof.vista.tipo === "alumnos"}
      <Alumnos />
    {:else}
      <Grupos />
    {/if}
  </main>
</div>

<Credenciales />

<style>
  .area-profesor {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .barra-profesor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    padding: 0.5rem 1rem;
    background: var(--superficie);
    border-bottom: 1px solid var(--borde);
  }
  nav button {
    border: none;
    background: transparent;
    color: var(--texto-suave);
  }
  nav button.activa {
    background: var(--primario-suave);
    color: var(--primario);
    font-weight: 600;
  }
  .selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-weight: normal;
  }
  .selector select {
    width: auto;
    min-width: 160px;
  }
  .correo {
    font-size: 0.9em;
  }
  .contenido-profesor {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  @media (max-width: 700px) {
    .correo {
      display: none;
    }
  }
</style>
