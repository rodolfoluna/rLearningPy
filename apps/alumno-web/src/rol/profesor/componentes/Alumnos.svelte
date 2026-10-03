<script lang="ts">
  // Gestión de alumnos: alta individual o en lote (pegar "control,nombre" o subir un CSV),
  // restablecer contraseña, editar y dar de baja.
  import { avisar } from "@rlp/alumno-ui";
  import type { Credenciales } from "@rlp/nube";
  import { fecha, mensajeError, Modal } from "@rlp/ui-comun";
  import { leerListaAlumnos } from "../lib/csv";
  import { datos } from "../lib/datos";
  import { alumnosVisibles, nombreGrupo, prof } from "../lib/estado.svelte";
  import type { AlumnoFila } from "../lib/tipos";

  // svelte-ignore state_referenced_locally (valor inicial: el grupo del filtro)
  let grupoAlta = $state<string>(prof.grupoId ?? "");
  let control = $state("");
  let nombre = $state("");
  let lista = $state("");
  let creando = $state(false);
  let progreso = $state("");
  let errores = $state<string[]>([]);
  let editar = $state<{ a: AlumnoFila; nombre: string; grupo: string } | null>(null);
  let borrar = $state<AlumnoFila | null>(null);
  let restablecer = $state<AlumnoFila | null>(null);
  let ocupado = $state(false);

  const previa = $derived(leerListaAlumnos(lista));
  const visibles = $derived(alumnosVisibles());

  async function crearVarios(filas: { control: string; nombre: string; linea?: number }[]) {
    creando = true;
    errores = [];
    const hechas: Credenciales[] = [];
    const grupo = grupoAlta || null;
    for (const [i, f] of filas.entries()) {
      progreso = `Creando ${i + 1} de ${filas.length}: ${f.nombre}…`;
      try {
        hechas.push(await datos().crearAlumno({ control: f.control, nombre: f.nombre, grupo }));
      } catch (e) {
        errores.push(`${f.linea ? `Línea ${f.linea}` : f.control}: ${mensajeError(e)}`);
      }
    }
    creando = false;
    progreso = "";
    if (hechas.length) {
      prof.credenciales = {
        titulo: hechas.length === 1 ? `Alumno creado: ${hechas[0].nombre}` : `${hechas.length} alumnos creados`,
        grupo: nombreGrupo(grupo),
        lista: hechas,
      };
    }
    return hechas.length;
  }

  async function crearUno(e: SubmitEvent) {
    e.preventDefault();
    if (await crearVarios([{ control: control.trim(), nombre: nombre.trim() }])) {
      control = "";
      nombre = "";
    }
  }

  async function crearLista() {
    const n = await crearVarios(previa.filas);
    if (n && !errores.length) lista = "";
  }

  async function leerArchivo(e: Event) {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    lista = await archivo.text();
    input.value = "";
  }

  async function guardarEdicion() {
    if (!editar) return;
    ocupado = true;
    try {
      await datos().actualizarAlumno(editar.a.id, { nombre: editar.nombre.trim(), grupo: editar.grupo || null });
      avisar("Cambios guardados.");
      editar = null;
    } catch (e) {
      avisar(mensajeError(e), 6000);
    } finally {
      ocupado = false;
    }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    ocupado = true;
    try {
      await datos().eliminarAlumno(borrar.id);
      avisar(`${borrar.nombre} fue dado de baja.`);
      borrar = null;
    } catch (e) {
      avisar(mensajeError(e), 6000);
    } finally {
      ocupado = false;
    }
  }

  async function confirmarRestablecer() {
    const a = restablecer;
    if (!a) return;
    ocupado = true;
    try {
      const c = await datos().restablecerAlumno(a.id);
      restablecer = null;
      prof.credenciales = { titulo: `Contraseña nueva de ${a.nombre}`, grupo: nombreGrupo(a.grupo), lista: [c] };
    } catch (e) {
      avisar(mensajeError(e), 6000);
    } finally {
      ocupado = false;
    }
  }
</script>

<div class="pagina-profesor">
  <h1>Alumnos</h1>

  <section class="tarjeta alta">
    <h2>Agregar alumnos</h2>
    <div class="fila">
      <label for="grupo-alta">Grupo</label>
      <select id="grupo-alta" bind:value={grupoAlta} style="width: auto; min-width: 200px">
        <option value="">Sin grupo</option>
        {#each prof.grupos as g (g.id)}
          <option value={g.id}>{g.nombre}</option>
        {/each}
      </select>
      {#if !prof.grupos.length}
        <button class="fantasma chico" onclick={() => (prof.vista = { tipo: "grupos" })}>＋ Crear un grupo primero</button>
      {/if}
    </div>

    <form class="fila uno" onsubmit={crearUno}>
      <div class="campo">
        <label for="alta-control">Número de control</label>
        <input id="alta-control" bind:value={control} autocomplete="off" placeholder="21340500" />
      </div>
      <div class="campo crece">
        <label for="alta-nombre">Nombre completo</label>
        <input id="alta-nombre" bind:value={nombre} autocomplete="off" placeholder="Karla Pérez López" />
      </div>
      <button class="primario" type="submit" disabled={creando || !control.trim() || nombre.trim().length < 3}>Crear alumno</button>
    </form>

    <details open={lista.length > 0}>
      <summary>Varios a la vez (pegar una lista o subir un CSV)</summary>
      <p class="suave chico">
        Una línea por alumno: <code>número de control,nombre</code> (también sirve con <code>;</code> o tabulador, como al
        copiar de Excel). Un encabezado en la primera línea se ignora.
      </p>
      <textarea rows="7" bind:value={lista} aria-label="Lista de alumnos" placeholder={"21340500,Karla Pérez López\n21340501,Luis Gómez Ruiz"}></textarea>
      <div class="fila">
        <label class="boton chico">
          📄 Subir CSV
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onchange={leerArchivo} hidden />
        </label>
        <span class="suave chico">{previa.filas.length} alumno(s) listos{previa.errores.length ? `, ${previa.errores.length} línea(s) con problemas` : ""}</span>
        <span class="espaciador"></span>
        <button class="primario" onclick={crearLista} disabled={creando || !previa.filas.length} data-crear-lista>
          Crear {previa.filas.length} alumno(s)
        </button>
      </div>
      {#if previa.errores.length}
        <ul class="errores">{#each previa.errores as e (e)}<li>{e}</li>{/each}</ul>
      {/if}
    </details>

    {#if progreso}<p class="info">{progreso}</p>{/if}
    {#if errores.length}
      <div class="error">
        <strong>No se pudieron crear:</strong>
        <ul>{#each errores as e (e)}<li>{e}</li>{/each}</ul>
      </div>
    {/if}
  </section>

  <section>
    <h2>{prof.grupoId === null ? "Todos los alumnos" : nombreGrupo(prof.grupoId)} ({visibles.length})</h2>
    {#if visibles.length}
      <div class="tabla-desplazable">
        <table class="datos">
          <thead>
            <tr><th>Número de control</th><th>Nombre</th><th>Grupo</th><th>Estado</th><th>Alta</th><th></th></tr>
          </thead>
          <tbody>
            {#each visibles as a (a.id)}
              <tr data-fila-alumno={a.control}>
                <td>{a.control}</td>
                <td>{a.nombre}</td>
                <td>{nombreGrupo(a.grupo)}</td>
                <td>{a.debeCambiarClave ? "Con contraseña temporal" : "Activo"}</td>
                <td>{fecha(a.creado)}</td>
                <td class="acciones">
                  <button class="chico" onclick={() => (editar = { a, nombre: a.nombre, grupo: a.grupo ?? "" })}>✏ Editar</button>
                  <button class="chico" onclick={() => (restablecer = a)}>🔑 Restablecer contraseña</button>
                  <button class="chico peligro" onclick={() => (borrar = a)}>🗑 Dar de baja</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if !prof.cargando}
      <p class="suave">No hay alumnos {prof.grupoId === null ? "todavía" : "en este grupo"}.</p>
    {/if}
  </section>
</div>

<Modal titulo="Editar alumno" abierto={editar !== null} cerrar={() => (editar = null)}>
  {#if editar}
    <div class="campo"><label for="ed-nombre">Nombre</label><input id="ed-nombre" bind:value={editar.nombre} /></div>
    <div class="campo">
      <label for="ed-grupo">Grupo</label>
      <select id="ed-grupo" bind:value={editar.grupo}>
        <option value="">Sin grupo</option>
        {#each prof.grupos as g (g.id)}<option value={g.id}>{g.nombre}</option>{/each}
      </select>
    </div>
    <p class="suave chico">El número de control no se puede cambiar (es su usuario). Si está mal, da de baja al alumno y créalo de nuevo.</p>
  {/if}
  {#snippet acciones()}
    <button onclick={() => (editar = null)}>Cancelar</button>
    <button class="primario" onclick={guardarEdicion} disabled={ocupado || (editar?.nombre.trim().length ?? 0) < 3}>Guardar</button>
  {/snippet}
</Modal>

<Modal titulo="Restablecer contraseña" abierto={restablecer !== null} cerrar={() => (restablecer = null)}>
  <p>
    Se genera una contraseña temporal nueva para <strong>{restablecer?.nombre}</strong> y la anterior deja de servir. Su
    progreso no cambia.
  </p>
  {#snippet acciones()}
    <button onclick={() => (restablecer = null)}>Cancelar</button>
    <button class="primario" onclick={confirmarRestablecer} disabled={ocupado}>{ocupado ? "Generando…" : "Generar contraseña nueva"}</button>
  {/snippet}
</Modal>

<Modal titulo="Dar de baja" abierto={borrar !== null} cerrar={() => (borrar = null)}>
  <p>
    Se borran <strong>{borrar?.nombre}</strong> ({borrar?.control}) y todo su progreso. Ya no podrá entrar. Esto no se puede
    deshacer.
  </p>
  {#snippet acciones()}
    <button onclick={() => (borrar = null)}>Cancelar</button>
    <button class="peligro" onclick={confirmarBorrar} disabled={ocupado}>Dar de baja</button>
  {/snippet}
</Modal>

<style>
  .alta {
    display: grid;
    gap: 0.8rem;
    max-width: 900px;
  }
  .alta h2,
  section > h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .uno {
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .uno .campo {
    margin: 0;
  }
  .crece {
    flex: 1;
    min-width: 220px;
  }
  details summary {
    cursor: pointer;
    color: var(--primario);
  }
  details textarea {
    width: 100%;
    font-family: var(--fuente-codigo);
    margin: 0.4rem 0;
  }
  .errores {
    color: var(--aviso);
    font-size: 0.9em;
  }
  .acciones {
    display: flex;
    gap: 0.4rem;
  }
  label.boton {
    cursor: pointer;
    margin: 0;
  }
</style>
