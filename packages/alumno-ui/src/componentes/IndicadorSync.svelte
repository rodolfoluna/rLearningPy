<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { textoSync } from "../lib/sync";

  // Al tocarlo se abre el menú donde está "Enviar ahora" y el ajuste de sincronización.
  let { alTocar }: { alTocar?: () => void } = $props();

  const iconos = {
    "sin-conexion": "⚠",
    sincronizando: "⟳",
    sincronizado: "✓",
    "pendiente-datos": "☁︎",
    "enviando-datos": "⟳",
    "en-pausa": "☁︎",
  } as const;
  const texto = $derived(app.sincronizacion ? textoSync(app.sincronizacion, app.red) : "");
</script>

{#if app.sincronizacion}
  <button type="button" class="sync fantasma" data-sync={app.sincronizacion} title={texto} aria-label={`Sincronización: ${texto}`}
    onclick={() => alTocar?.()}>
    <span class="icono" aria-hidden="true">{iconos[app.sincronizacion]}</span>
    <span class="texto" role="status">{texto}</span>
  </button>
{/if}

<style>
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    font-size: 0.82em;
    padding: 0.15em 0.6em;
    min-height: 0;
    border-radius: 999px;
    border: 1px solid var(--borde);
    white-space: nowrap;
    color: var(--texto-suave);
    font-weight: normal;
  }
  .icono {
    position: relative;
    display: inline-block;
  }
  [data-sync="sin-conexion"] {
    background: var(--aviso-suave);
    color: var(--aviso);
    border-color: color-mix(in srgb, var(--aviso) 30%, transparent);
  }
  [data-sync="sincronizado"] {
    color: var(--exito);
  }
  /* Avances sin enviar con datos móviles: nube con un punto ámbar. */
  [data-sync="pendiente-datos"] .icono::after {
    content: "";
    position: absolute;
    right: -0.3em;
    top: -0.1em;
    width: 0.55em;
    height: 0.55em;
    border-radius: 50%;
    background: var(--acento);
    box-shadow: 0 0 0 1.5px var(--superficie);
  }
  [data-sync="pendiente-datos"] {
    color: var(--aviso);
  }
  [data-sync="enviando-datos"] .icono {
    animation: girar 1s linear infinite;
  }
  @keyframes girar {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-sync="enviando-datos"] .icono {
      animation: none;
    }
  }
  @media (max-width: 900px) {
    .texto {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    [data-sync="sin-conexion"] .texto {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
    }
  }
</style>
