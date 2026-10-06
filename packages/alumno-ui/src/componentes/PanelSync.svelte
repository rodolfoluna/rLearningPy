<script lang="ts">
  // Sincronización en el menú de la cuenta (☰ en celulares): estado, "Enviar ahora" con datos
  // móviles y el ajuste de este dispositivo. Sin ventanas emergentes.
  import { app, cambiarAjusteSync, enviarAhora } from "../lib/app.svelte";
  import { textoSync } from "../lib/sync";
  import type { AjusteSync } from "../lib/tipos";

  let { id = "sync" }: { id?: string } = $props();

  const AJUSTES: [AjusteSync, string][] = [
    ["wifi", "Automática en Wi‑Fi, preguntar con datos"],
    ["siempre", "Siempre automática"],
    ["manual", "Solo cuando yo lo pida"],
  ];
  const estado = $derived(app.sincronizacion);
  const red = $derived(app.red);
</script>

{#if estado && red}
  <div class="panel-sync" data-panel-sync={estado}>
    <p class="estado" class:pendiente={estado === "pendiente-datos"}>{textoSync(estado, red)}</p>
    {#if estado === "pendiente-datos"}
      <button class="primario chico" onclick={enviarAhora} data-enviar-ahora>Enviar ahora</button>
      {#if red.ajuste !== "manual"}
        <label class="siempre">
          <input type="checkbox" checked={red.ajuste === "siempre"}
            onchange={(e) => cambiarAjusteSync(e.currentTarget.checked ? "siempre" : "wifi")} />
          Permitir siempre con datos móviles
        </label>
      {/if}
    {/if}
    <fieldset class="ajuste" role="radiogroup" aria-labelledby={`${id}-ajuste`}>
      <legend id={`${id}-ajuste`}>Sincronización</legend>
      {#each AJUSTES as [valor, texto] (valor)}
        <label class="opcion-sync">
          <input type="radio" name={`${id}-ajuste`} value={valor} checked={red.ajuste === valor}
            onchange={() => cambiarAjusteSync(valor)} />
          <span>{texto}</span>
        </label>
      {/each}
    </fieldset>
  </div>
{/if}

<style>
  .panel-sync {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 0.4rem 0.9em 0.55rem;
    font-size: 0.88em;
  }
  .estado {
    margin: 0;
    color: var(--texto-suave);
  }
  .estado.pendiente {
    color: var(--aviso);
    font-weight: 600;
  }
  .siempre {
    display: flex;
    gap: 0.45em;
    align-items: center;
    margin: 0;
    font-weight: normal;
    font-size: 1em;
    color: var(--texto-suave);
  }
  .siempre input {
    padding: 0;
    margin: 0;
    width: 1.05em;
    height: 1.05em;
    flex: none;
  }
  .ajuste {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    min-width: 0;
    margin: 0.2rem 0 0;
    padding: 0;
    border: none;
  }
  legend {
    padding: 0;
    margin-bottom: 0.2rem;
    font-weight: 600;
  }
  .opcion-sync {
    display: flex;
    gap: 0.5em;
    align-items: flex-start;
    margin: 0;
    padding: 0.3rem 0;
    font-weight: normal;
    font-size: 1em;
    line-height: 1.3;
    cursor: pointer;
  }
  .opcion-sync span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .opcion-sync input {
    flex: none;
    width: 1.05em;
    height: 1.05em;
    margin: 0.12em 0 0;
    padding: 0;
  }
</style>
