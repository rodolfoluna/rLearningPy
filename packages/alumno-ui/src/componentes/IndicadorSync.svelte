<script lang="ts">
  import { app } from "../lib/app.svelte";

  const textos = {
    "sin-conexion": { icono: "⚠", texto: "Sin conexión — cambios guardados en este equipo" },
    sincronizando: { icono: "⟳", texto: "Sincronizando…" },
    sincronizado: { icono: "✓", texto: "Sincronizado" },
  } as const;
  const actual = $derived(app.sincronizacion ? textos[app.sincronizacion] : null);
</script>

{#if actual}
  <span class="sync" data-sync={app.sincronizacion} role="status" title={actual.texto}>
    <span aria-hidden="true">{actual.icono}</span>
    <span class="texto">{actual.texto}</span>
  </span>
{/if}

<style>
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    font-size: 0.82em;
    padding: 0.15em 0.6em;
    border-radius: 999px;
    border: 1px solid var(--borde);
    white-space: nowrap;
    color: var(--texto-suave);
  }
  [data-sync="sin-conexion"] {
    background: var(--aviso-suave);
    color: var(--aviso);
    border-color: color-mix(in srgb, var(--aviso) 30%, transparent);
  }
  [data-sync="sincronizado"] {
    color: var(--exito);
  }
  @media (max-width: 900px) {
    .texto {
      display: none;
    }
    [data-sync="sin-conexion"] .texto {
      display: inline;
    }
  }
</style>
