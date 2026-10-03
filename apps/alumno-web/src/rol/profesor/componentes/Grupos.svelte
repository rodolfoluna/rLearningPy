<script lang="ts">
  // Grupos y sus políticas: pegado en el editor (bloquear / solo lo copiado en la app) y si se
  // cuentan las salidas de la ventana. Los alumnos reciben los cambios al momento.
  import { avisar } from "@rlp/alumno-ui";
  import type { PoliticaPegadoGrupo } from "@rlp/nube";
  import { fecha, mensajeError, Modal } from "@rlp/ui-comun";
  import { datos } from "../lib/datos";
  import { prof } from "../lib/estado.svelte";
  import type { Grupo } from "../lib/tipos";

  interface Formulario {
    id: string | null;
    nombre: string;
    pegado: PoliticaPegadoGrupo;
    registrarSalidas: boolean;
  }

  let form = $state<Formulario | null>(null);
  let borrar = $state<Grupo | null>(null);
  let ocupado = $state(false);

  const cuantos = (id: string) => prof.alumnos.filter((a) => a.grupo === id).length;

  function nuevo() {
    form = { id: null, nombre: "", pegado: "bloquear", registrarSalidas: true };
  }

  function editar(g: Grupo) {
    form = { id: g.id, nombre: g.nombre, pegado: g.politicas.pegado, registrarSalidas: g.politicas.registrarSalidas ?? true };
  }

  async function guardar(e?: SubmitEvent) {
    e?.preventDefault();
    if (!form || form.nombre.trim().length < 2) return;
    ocupado = true;
    try {
      const politicas = { pegado: form.pegado, registrarSalidas: form.registrarSalidas };
      await datos().guardarGrupo(form.id, { nombre: form.nombre.trim(), politicas });
      avisar(form.id ? "Grupo actualizado." : `Grupo «${form.nombre.trim()}» creado.`);
      form = null;
    } catch (err) {
      avisar(mensajeError(err), 6000);
    } finally {
      ocupado = false;
    }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    ocupado = true;
    try {
      await datos().eliminarGrupo(borrar.id);
      if (prof.grupoId === borrar.id) prof.grupoId = null;
      avisar("Grupo borrado. Sus alumnos quedaron sin grupo.");
      borrar = null;
    } catch (err) {
      avisar(mensajeError(err), 6000);
    } finally {
      ocupado = false;
    }
  }
</script>

<div class="pagina-profesor">
  <div class="fila">
    <h1>Grupos</h1>
    <span class="espaciador"></span>
    <button class="primario" onclick={nuevo}>＋ Nuevo grupo</button>
  </div>
  <p class="suave">
    Cada grupo define qué se permite en el editor de sus alumnos. Los cambios les llegan solos (la próxima vez que tengan
    conexión).
  </p>
  {#if !prof.grupos.length}
    <div class="tarjeta vacio">Aún no tienes grupos.</div>
  {/if}
  <div class="lista">
    {#each prof.grupos as g (g.id)}
      <div class="tarjeta grupo" data-grupo={g.nombre}>
        <div>
          <h2>{g.nombre}</h2>
          <p class="suave">
            {cuantos(g.id)} alumno(s){g.creado ? ` · creado el ${fecha(g.creado)}` : ""}<br />
            Pegado: <strong>{g.politicas.pegado === "bloquear" ? "bloqueado siempre" : "solo lo copiado dentro de la app"}</strong> ·
            Salidas de la ventana: <strong>{g.politicas.registrarSalidas === false ? "no se registran" : "se registran"}</strong>
          </p>
        </div>
        <div class="fila">
          <button onclick={() => ((prof.grupoId = g.id), (prof.vista = { tipo: "tablero" }))}>📊 Ver tablero</button>
          <button onclick={() => ((prof.grupoId = g.id), (prof.vista = { tipo: "alumnos" }))}>🎓 Alumnos</button>
          <button onclick={() => editar(g)}>✏ Editar</button>
          <button class="peligro" onclick={() => (borrar = g)}>🗑 Borrar</button>
        </div>
      </div>
    {/each}
  </div>
</div>

<Modal titulo={form?.id ? "Editar grupo" : "Nuevo grupo"} abierto={form !== null} cerrar={() => (form = null)} ancho="600px">
  {#if form}
    <form id="form-grupo" onsubmit={guardar}>
      <div class="campo">
        <label for="gn">Nombre del grupo</label>
        <input id="gn" bind:value={form.nombre} placeholder="Programación 1A" />
      </div>
      <fieldset class="campo">
        <legend>Pegar en el editor</legend>
        <label class="opcion"><input type="radio" bind:group={form.pegado} value="bloquear" /> Bloquear siempre (recomendado)</label>
        <label class="opcion">
          <input type="radio" bind:group={form.pegado} value="propio" /> Permitir pegar solo lo que el alumno copió dentro de la
          app (se cuenta)
        </label>
      </fieldset>
      <label class="opcion"><input type="checkbox" bind:checked={form.registrarSalidas} /> Contar las salidas de la ventana y el tiempo fuera</label>
    </form>
  {/if}
  {#snippet acciones()}
    <button onclick={() => (form = null)}>Cancelar</button>
    <button class="primario" type="submit" form="form-grupo" disabled={ocupado || (form?.nombre.trim().length ?? 0) < 2}>
      {form?.id ? "Guardar" : "Crear grupo"}
    </button>
  {/snippet}
</Modal>

<Modal titulo="Borrar grupo" abierto={borrar !== null} cerrar={() => (borrar = null)}>
  <p>
    Se borra el grupo <strong>{borrar?.nombre}</strong>. Sus {borrar ? cuantos(borrar.id) : 0} alumno(s) no se borran: quedan
    sin grupo (con el pegado bloqueado).
  </p>
  {#snippet acciones()}
    <button onclick={() => (borrar = null)}>Cancelar</button>
    <button class="peligro" onclick={confirmarBorrar} disabled={ocupado}>Borrar grupo</button>
  {/snippet}
</Modal>

<style>
  .lista {
    display: grid;
    gap: 0.8rem;
    max-width: 1000px;
  }
  .grupo {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.8rem;
    align-items: center;
  }
  .grupo h2 {
    margin: 0 0 0.2rem;
    font-size: 1.1rem;
  }
  .grupo p {
    margin: 0;
  }
  .vacio {
    text-align: center;
    padding: 2rem;
  }
  fieldset {
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    padding: 0.5rem 0.8rem;
  }
  .opcion {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    font-weight: normal;
  }
  .opcion input {
    width: auto;
    margin-top: 0.25em;
  }
</style>
