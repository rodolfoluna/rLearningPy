<script lang="ts">
  type Nivel = "verde" | "amarillo" | "rojo";
  interface Props {
    nivel: Nivel;
    texto?: boolean;
    etiquetas?: Record<Nivel, string>;
    /** Explicación al pasar el puntero (por defecto, la etiqueta). */
    titulo?: string;
  }
  let { nivel, texto = true, etiquetas = { verde: "Íntegro", amarillo: "Revisar", rojo: "Alterado" }, titulo }: Props = $props();
</script>

<span class="semaforo {nivel}" title={titulo || etiquetas[nivel]} data-nivel={nivel}>
  <span class="punto" aria-hidden="true"></span>{#if texto}{etiquetas[nivel]}{/if}
</span>
