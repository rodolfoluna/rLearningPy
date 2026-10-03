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

  // En pantallas angostas las secciones, el filtro y la cuenta se pliegan en un menú (☰).
  let menuAbierto = $state(false);
  let barra: HTMLElement | undefined = $state();
  let botonMenu: HTMLButtonElement | undefined = $state();

  function irA(vista: typeof prof.vista) {
    prof.vista = vista;
    menuAbierto = false;
  }
  function teclaGlobal(e: KeyboardEvent) {
    if (e.key === "Escape" && menuAbierto) {
      menuAbierto = false;
      botonMenu?.focus();
    }
  }
  function clicGlobal(e: PointerEvent) {
    if (menuAbierto && barra && !barra.contains(e.target as Node)) menuAbierto = false;
  }
</script>

<svelte:window onkeydown={teclaGlobal} onpointerdown={clicGlobal} />

<div class="area-profesor" data-area-profesor>
  <header class="barra-profesor" bind:this={barra}>
    <strong class="marca">🧑‍🏫 Profesor</strong>
    <span class="espaciador solo-movil"></span>
    <button class="fantasma solo-movil hamburguesa" aria-label="Menú" aria-controls="menu-profesor" aria-expanded={menuAbierto}
      bind:this={botonMenu} onclick={() => (menuAbierto = !menuAbierto)}>☰</button>
    <div class="menu-profesor" class:abierto={menuAbierto} id="menu-profesor">
      <nav class="fila" aria-label="Secciones">
        <button class:activa={enTablero} onclick={() => irA({ tipo: "tablero" })}>📊 Tablero</button>
        <button class:activa={prof.vista.tipo === "alumnos"} onclick={() => irA({ tipo: "alumnos" })}>🎓 Alumnos</button>
        <button class:activa={prof.vista.tipo === "grupos"} onclick={() => irA({ tipo: "grupos" })}>👥 Grupos</button>
      </nav>
      <span class="espaciador"></span>
      <label class="selector">
        <span class="suave">Grupo</span>
        <select bind:value={prof.grupoId} aria-label="Filtrar por grupo" onchange={() => (menuAbierto = false)}>
          <option value={null}>Todos</option>
          {#each prof.grupos as g (g.id)}
            <option value={g.id}>{g.nombre}</option>
          {/each}
          <option value="">Sin grupo</option>
        </select>
      </label>
      {#if correo}<span class="suave correo">{correo}</span>{/if}
      <button class="chico" onclick={salir}>Cerrar sesión</button>
    </div>
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
    position: relative;
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
  .menu-profesor {
    display: contents;
  }
  .solo-movil {
    display: none;
  }
  @media (max-width: 700px) {
    .solo-movil {
      display: inline-flex;
    }
    .hamburguesa {
      font-size: 1.25rem;
    }
    .menu-profesor {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 50;
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
      padding: 0.75rem 1rem 1rem;
      background: var(--superficie);
      border-bottom: 1px solid var(--borde);
      box-shadow: 0 12px 24px rgb(0 0 0 / 0.15);
    }
    .menu-profesor.abierto {
      display: flex;
    }
    .menu-profesor nav {
      flex-direction: column;
      align-items: stretch;
      gap: 0.2rem;
    }
    .menu-profesor nav button {
      justify-content: flex-start;
    }
    .menu-profesor .espaciador {
      display: none;
    }
    .selector select {
      flex: 1;
      min-width: 0;
    }
    .correo {
      overflow-wrap: anywhere;
    }
  }
</style>
