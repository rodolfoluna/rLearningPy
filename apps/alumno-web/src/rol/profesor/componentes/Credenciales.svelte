<script lang="ts">
  // Credenciales recién generadas (alta o restablecer): tabla, CSV y hoja de tarjetas para imprimir.
  // Las contraseñas temporales no se guardan en ningún lado: solo se ven aquí.
  import { Modal } from "@rlp/ui-comun";
  import { descargar, hoy } from "../lib/csv";
  import { direccionApp, prof } from "../lib/estado.svelte";
  import { csvCredenciales, htmlCredenciales, imprimirHtml } from "../lib/informes";

  const c = $derived(prof.credenciales);

  function csv() {
    if (!c) return;
    descargar(`credenciales-${c.grupo.replace(/[^\p{L}\p{N}]+/gu, "-")}-${hoy()}.csv`, csvCredenciales(c.lista, c.grupo));
  }

  function imprimir() {
    if (c) imprimirHtml(htmlCredenciales(c.lista, c.grupo, direccionApp()));
  }
</script>

<Modal titulo={c?.titulo ?? "Credenciales"} abierto={c !== null} cerrar={() => (prof.credenciales = null)} ancho="760px">
  {#if c}
    <p class="aviso">
      Descárgalas o imprímelas ahora: las contraseñas temporales no se guardan y no se pueden volver a ver (si se pierde
      una, restablécela).
    </p>
    <div class="tabla-desplazable" style="max-height: 50vh">
      <table class="datos" data-credenciales>
        <thead><tr><th>Número de control</th><th>Nombre</th><th>Contraseña temporal</th></tr></thead>
        <tbody>
          {#each c.lista as x (x.alumnoId)}
            <tr data-credencial={x.control}><td>{x.control}</td><td>{x.nombre}</td><td class="clave" data-clave>{x.clave}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="suave chico">Los alumnos entran en <strong>{direccionApp()}</strong> con su número de control y esta contraseña.</p>
  {/if}
  {#snippet acciones()}
    <button onclick={csv}>⬇ Descargar CSV</button>
    <button onclick={imprimir}>🖨 Imprimir</button>
    <button class="primario" onclick={() => (prof.credenciales = null)}>Listo</button>
  {/snippet}
</Modal>
