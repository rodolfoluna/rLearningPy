<script lang="ts">
  import type { Actividad as ActCurso } from "@rlp/curso";
  import { crearVisor, type EditorCodigo } from "@rlp/editor";
  import type { ResultadoPruebas } from "@rlp/python-worker";
  import { avisar, python } from "@rlp/alumno-ui";
  import { contadoresVacios } from "@rlp/nube";
  import { fecha, Markdown, mensajeError, minutos, Modal, Semaforo } from "@rlp/ui-comun";
  import { onDestroy } from "svelte";
  import { datos } from "../lib/datos";
  import { actividades, curso, nombreGrupo, prof } from "../lib/estado.svelte";
  import { completadas, puntos } from "../lib/informes";
  import { lineaDeTiempo, operaciones, ritmo, verificarLinea } from "../lib/linea";
  import { nivelAlerta } from "../lib/nivel";
  import type { Actividad, LineaDeTiempo } from "../lib/tipos";
  import { ETIQUETAS_NIVEL } from "./etiquetas";
  import Reproductor from "./Reproductor.svelte";

  let { alumnoId }: { alumnoId: string } = $props();

  const a = $derived(prof.alumnos.find((x) => x.id === alumnoId) ?? null);
  const alerta = $derived(a ? nivelAlerta(a.global) : null);

  let pestana: "actividades" | "estadisticas" = $state("actividades");
  // svelte-ignore state_referenced_locally (el componente se crea de nuevo para cada alumno)
  let elegida = $state<ActCurso | null>(actividades.find((x) => a?.avance[x.id]) ?? actividades[0] ?? null);
  /** Documento de la actividad elegida: undefined mientras carga; null si no existe. */
  let doc = $state<Actividad | null | undefined>(undefined);
  let visorPadre: HTMLDivElement | undefined = $state();
  let visor: EditorCodigo | null = null;
  let pruebas = $state<ResultadoPruebas | null>(null);
  let probando = $state(false);
  let calificacion = $state("");
  let comentario = $state("");
  let notaCargadaDe = "";
  let guardando = $state(false);
  let reproduccion = $state<LineaDeTiempo | null>(null);
  let confirmarReset = $state(false);
  let restableciendo = $state(false);

  // Escucha la actividad elegida (1 lectura al abrirla y después solo sus cambios).
  $effect(() => {
    const id = elegida?.id;
    if (!id) return;
    doc = undefined;
    pruebas = null;
    notaCargadaDe = "";
    return datos().escucharActividad(
      alumnoId,
      id,
      (d) => {
        doc = d;
        if (notaCargadaDe !== id) {
          notaCargadaDe = id;
          calificacion = d?.nota?.calificacion != null ? String(d.nota.calificacion) : "";
          comentario = d?.nota?.comentario ?? "";
        }
      },
      (e) => avisar(mensajeError(e), 6000),
    );
  });

  // El visor vive dentro de un {#if}: si su contenedor cambia, se crea de nuevo.
  let visorDe: HTMLDivElement | null = null;
  $effect(() => {
    const codigo = doc?.codigo ?? "";
    const padre = visorPadre && pestana === "actividades" && elegida?.tipo === "codigo" ? visorPadre : null;
    if (padre !== visorDe) {
      visor?.destruir();
      visor = padre ? crearVisor(padre, codigo) : null;
      visorDe = padre;
    } else if (visor && visor.texto !== codigo) visor.establecerTexto(codigo);
  });

  onDestroy(() => visor?.destruir());

  const linea = $derived(elegida && doc && elegida.tipo === "codigo" ? lineaDeTiempo(elegida.id, doc, elegida.codigo_inicial ?? "") : null);
  const verificacion = $derived(linea ? verificarLinea(linea, elegida?.codigo_inicial ?? "") : null);
  const ritmoAct = $derived(linea ? ritmo(operaciones(linea)) : null);
  const est = $derived(elegida && a ? (a.porActividad[elegida.id] ?? contadoresVacios()) : contadoresVacios());
  const resumen = $derived(elegida && a ? a.avance[elegida.id] : undefined);

  function marca(id: string): string {
    const x = a?.avance[id];
    if (!x) return "○";
    return x.completada ? "✓" : "●";
  }

  async function reprobar() {
    if (!elegida?.pruebas || !doc) return;
    probando = true;
    try {
      pruebas = await python.probar(doc.codigo ?? "", elegida.pruebas);
    } catch (e) {
      avisar(mensajeError(e));
    } finally {
      probando = false;
    }
  }

  async function guardarCalificacion() {
    if (!elegida) return;
    const texto = calificacion.trim().replace(",", ".");
    const valor = texto === "" ? null : Number(texto);
    if (valor !== null && Number.isNaN(valor)) return avisar("La calificación debe ser un número.");
    guardando = true;
    try {
      const nota = valor === null && !comentario.trim() ? null : { calificacion: valor, comentario: comentario.trim() };
      await datos().calificar(alumnoId, elegida.id, nota);
      avisar(nota ? "Calificación guardada. El alumno la verá en la actividad." : "Calificación borrada.");
    } catch (e) {
      avisar(mensajeError(e), 6000);
    } finally {
      guardando = false;
    }
  }

  async function restablecer() {
    if (!a) return;
    restableciendo = true;
    try {
      const c = await datos().restablecerAlumno(alumnoId);
      confirmarReset = false;
      prof.credenciales = { titulo: `Contraseña nueva de ${a.nombre}`, grupo: nombreGrupo(a.grupo), lista: [c] };
    } catch (e) {
      avisar(mensajeError(e), 6000);
    } finally {
      restableciendo = false;
    }
  }
</script>

<div class="pagina-profesor detalle">
  <div class="fila cabeza">
    <button class="chico" onclick={() => (prof.vista = { tipo: "tablero" })}>← Tablero</button>
    {#if a}
      <div class="quien">
        <h1>{a.nombre}</h1>
        <span class="suave">
          {a.control} · {nombreGrupo(a.grupo)} · {completadas(a)}/{actividades.length} actividades · {puntos(a)} puntos ·
          última sincronización: {a.ultimaSync ? fecha(a.ultimaSync) : "nunca"}{#if a.ultimaSync && a.conDatosMoviles}
            <span title="Con datos móviles: su app envía los avances con Wi‑Fi o cuando el alumno lo pide">📶</span>{/if}
        </span>
      </div>
      <span class="espaciador"></span>
      {#if alerta}<Semaforo nivel={alerta.nivel} etiquetas={ETIQUETAS_NIVEL} titulo={alerta.motivos.join("; ") || "Sin alertas"} />{/if}
      <button class="chico" onclick={() => (confirmarReset = true)}>🔑 Restablecer contraseña</button>
    {/if}
  </div>

  {#if !a}
    <p class="suave">{prof.cargando ? "Cargando…" : "Este alumno ya no existe."}</p>
  {:else}
    {#if a.debeCambiarClave}
      <p class="info">Aún no entra por primera vez (o le restableciste la contraseña): tiene que cambiar su contraseña temporal.</p>
    {/if}
    {#if alerta?.motivos.length}
      <p class="aviso">⚠ {alerta.motivos.join(" · ")}</p>
    {/if}
    <div class="pestanas" role="tablist">
      <button role="tab" aria-selected={pestana === "actividades"} class:activa={pestana === "actividades"} onclick={() => (pestana = "actividades")}>⌨ Actividades</button>
      <button role="tab" aria-selected={pestana === "estadisticas"} class:activa={pestana === "estadisticas"} onclick={() => (pestana = "estadisticas")}>📊 Estadísticas</button>
    </div>

    {#if pestana === "actividades"}
      <section class="actividades">
        <nav class="lista" aria-label="Actividades">
          {#each curso.unidades as u (u.id)}
            <h4>U{u.numero} · {u.titulo}</h4>
            {#each u.lecciones as l (l.id)}
              <h5>{l.titulo}</h5>
              {#each l.actividades as act (act.id)}
                {@const c = a.porActividad[act.id]}
                <button class:activa={elegida?.id === act.id} class:sin-abrir={!a.avance[act.id]} onclick={() => (elegida = act)} data-act={act.id}>
                  <span class="marca" class:hecha={a.avance[act.id]?.completada}>{marca(act.id)}</span>
                  <span class="t">{act.titulo}</span>
                  {#if c?.pegados_intentos}<span class="insignia alerta" title="Intentos de pegar">🚫{c.pegados_intentos}</span>{/if}
                  {#if a.notas[act.id]?.calificacion != null}<span class="insignia" title="Calificación">{a.notas[act.id].calificacion}</span>{/if}
                </button>
              {/each}
            {/each}
          {/each}
        </nav>
        {#if elegida}
          <div class="panel">
            <h2>{elegida.titulo}</h2>
            <div class="fila chips">
              <span class="insignia" data-estado-act>
                {resumen?.completada ? `✓ Completada (${resumen.puntos} pts)` : resumen?.total ? `Pruebas ${resumen.pasadas}/${resumen.total}` : resumen ? "En progreso" : "Sin abrir"}
              </span>
              <span class="insignia">⏱ {minutos(est.tiempo_ms)}</span>
              <span class="insignia">▶ {est.ejecuciones} ejecuciones ({est.errores} con error)</span>
              <span class="insignia">✔ {resumen?.intentos ?? 0} intentos</span>
              <span class="insignia">💡 {doc?.pistas ?? 0} pistas</span>
              <span class="insignia">📋 {est.copias} copias</span>
              <span class="insignia" class:alerta={est.pegados_intentos > 0}>🚫 {est.pegados_intentos} intentos de pegar</span>
              {#if est.inserciones_sospechosas}<span class="insignia alerta">⚠ {est.inserciones_sospechosas} inserciones sospechosas</span>{/if}
              <span class="insignia">↗ {est.salidas} salidas</span>
              {#if ritmoAct?.rafagas}<span class="insignia alerta">⚡ {ritmoAct.rafagas} ráfagas</span>{/if}
            </div>
            {#if doc === undefined}
              <p class="suave">Cargando…</p>
            {:else if doc === null}
              <p class="suave">El alumno aún no abre esta actividad.</p>
            {:else if elegida.tipo === "codigo"}
              <div class="visor" bind:this={visorPadre} data-visor></div>
              {#if verificacion && linea}
                {#if !linea.tramos.length}
                  <p class="suave chico">Sin historial de escritura para esta actividad.</p>
                {:else if verificacion.reconstruye}
                  <p class="exito-msg chico">✔ El código guardado se reconstruye tecla a tecla desde su historial.</p>
                {:else}
                  <p class="alerta chico">⚠ El código guardado no sale exactamente de su historial{verificacion.error ? ` (${verificacion.error})` : ""}. Revisa la reproducción.</p>
                {/if}
              {/if}
              <div class="fila">
                <button onclick={() => (reproduccion = linea)} disabled={!linea?.tramos.length} data-ver-reproduccion>⏯ Ver cómo lo escribió</button>
                <button onclick={reprobar} disabled={probando || !elegida.pruebas?.length}>{probando ? "Probando…" : "✔ Volver a correr las pruebas"}</button>
                {#if pruebas}
                  <span class:alerta={pruebas.pasadas !== pruebas.total}>Pasaron {pruebas.pasadas} de {pruebas.total}</span>
                {/if}
              </div>
              {#if pruebas}
                <ul class="pruebas">
                  {#each pruebas.resultados as r (r.indice)}
                    <li class:mal={!r.paso}>{r.paso ? "✔" : "✖"} {r.nombre}{r.paso ? "" : ` — ${r.mensaje}`}</li>
                  {/each}
                </ul>
              {/if}
            {:else}
              <div class="tarjeta">
                <p class="suave">Respuesta del alumno:</p>
                <pre class="respuesta">{doc.respuesta ?? "(sin responder)"}</pre>
                {#if elegida.tipo === "prediccion"}
                  <p class="suave">Salida correcta:</p>
                  <pre class="respuesta">{elegida.salida_esperada}</pre>
                {:else if elegida.opciones}
                  <p class="suave">Opción correcta: {elegida.opciones.findIndex((o) => o.correcta) + 1}</p>
                {/if}
              </div>
            {/if}
            <details class="enunciado">
              <summary>Ver enunciado{elegida.solucion ? " y solución de referencia" : ""}</summary>
              <Markdown contenido={elegida.enunciado} />
              {#if elegida.solucion}<Markdown contenido={"```python\n" + elegida.solucion + "```"} />{/if}
            </details>
            <div class="tarjeta calificar">
              <div class="fila">
                <label for="cal">Calificación</label>
                <input id="cal" bind:value={calificacion} inputmode="decimal" placeholder="—" />
                <button class="primario" onclick={guardarCalificacion} disabled={guardando}>Guardar</button>
                {#if a.notas[elegida.id]}<span class="suave chico">guardada el {fecha(a.notas[elegida.id].actualizado)}</span>{/if}
              </div>
              <label for="com" class="suave">Comentario para el alumno (opcional; lo verá en esta actividad)</label>
              <textarea id="com" rows="2" bind:value={comentario}></textarea>
            </div>
          </div>
        {/if}
      </section>
    {:else}
      {@const g = a.global}
      <section class="tarjetas">
        {#each [["Tiempo de práctica", minutos(g.tiempo_ms)], ["Ejecuciones", g.ejecuciones], ["Con error", g.errores], ["Pruebas", g.pruebas], ["Pistas", g.pistas], ["Programas .exe", g.ejecutables ?? 0], ["Teclas", g.teclas], ["Copias", g.copias], ["Intentos de pegar", g.pegados_intentos], ["Pegados permitidos", g.pegados_permitidos], ["Inserciones sospechosas", g.inserciones_sospechosas], ["Salidas de ventana", g.salidas], ["Tiempo fuera", minutos(g.tiempo_fuera_ms)]] as [t, v] (t)}
          <div class="tarjeta dato"><span class="valor">{v}</span><span class="suave">{t}</span></div>
        {/each}
      </section>
      <p class="suave">Cuenta: {a.correo} · alta: {fecha(a.creado)}</p>
    {/if}
  {/if}
</div>

<Modal titulo="Restablecer contraseña" abierto={confirmarReset} cerrar={() => (confirmarReset = false)} ancho="520px">
  <p>
    Se genera una contraseña temporal nueva para <strong>{a?.nombre}</strong> y la anterior deja de servir. Su progreso no
    cambia. Al entrar tendrá que elegir una contraseña nueva.
  </p>
  {#snippet acciones()}
    <button onclick={() => (confirmarReset = false)}>Cancelar</button>
    <button class="primario" onclick={restablecer} disabled={restableciendo}>{restableciendo ? "Generando…" : "Generar contraseña nueva"}</button>
  {/snippet}
</Modal>

<Modal titulo={elegida ? `Cómo escribió: ${elegida.titulo}` : "Reproducción"} abierto={reproduccion !== null} cerrar={() => (reproduccion = null)} ancho="1000px">
  {#if reproduccion}
    {#key reproduccion}
      <Reproductor linea={reproduccion} />
    {/key}
  {/if}
</Modal>

<style>
  .cabeza {
    gap: 1rem;
    flex-wrap: wrap;
  }
  .pestanas {
    display: flex;
    gap: 0.3rem;
    border-bottom: 1px solid var(--borde);
  }
  .pestanas button {
    border: none;
    border-radius: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    color: var(--texto-suave);
  }
  .pestanas button.activa {
    border-bottom-color: var(--primario);
    color: var(--primario);
    font-weight: 600;
  }
  .actividades {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 1rem;
    align-items: start;
  }
  @media (max-width: 800px) {
    .actividades {
      grid-template-columns: 1fr;
    }
  }
  .lista {
    display: flex;
    flex-direction: column;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    padding: 0.5rem;
    max-height: calc(100vh - 260px);
    overflow: auto;
    position: sticky;
    top: 0;
  }
  .lista h4 {
    margin: 0.6rem 0.4rem 0.1rem;
    font-size: 0.85em;
    color: var(--texto-suave);
  }
  .lista h5 {
    margin: 0.3rem 0.4rem 0.1rem;
    font-size: 0.78em;
    font-weight: 600;
    color: var(--texto-suave);
  }
  .lista button {
    border: none;
    background: transparent;
    justify-content: flex-start;
    text-align: left;
    white-space: normal;
    font-size: 0.9em;
    padding: 0.3em 0.5em;
  }
  .lista button.sin-abrir {
    color: var(--texto-suave);
  }
  .lista button.activa {
    background: var(--primario-suave);
  }
  .t {
    flex: 1;
  }
  .marca {
    width: 1em;
    color: var(--aviso);
  }
  .marca.hecha {
    color: var(--exito);
  }
  .panel h2 {
    margin: 0 0 0.5rem;
  }
  .chips {
    margin-bottom: 0.8rem;
    flex-wrap: wrap;
  }
  .insignia.alerta {
    background: var(--aviso-suave);
    color: var(--aviso);
  }
  .visor {
    height: 340px;
    border: 1px solid var(--borde);
    border-radius: var(--radio-chico);
    overflow: hidden;
    margin-bottom: 0.6rem;
  }
  .visor :global(.cm-editor) {
    height: 100%;
  }
  .pruebas {
    padding-left: 1.2em;
  }
  .pruebas .mal {
    color: var(--peligro);
  }
  .respuesta {
    background: var(--superficie-2);
    padding: 0.5em 0.8em;
    border-radius: var(--radio-chico);
    font-family: var(--fuente-codigo);
    white-space: pre-wrap;
  }
  .enunciado {
    margin: 0.8rem 0;
  }
  .enunciado summary {
    cursor: pointer;
    color: var(--primario);
  }
  .calificar {
    display: grid;
    gap: 0.5rem;
    max-width: 640px;
  }
  .calificar label {
    margin: 0;
  }
  .calificar input {
    width: 100px;
  }
  .tarjetas {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.8rem;
  }
  .dato {
    display: flex;
    flex-direction: column;
  }
  .valor {
    font-size: 1.4rem;
    font-weight: 700;
  }
</style>
