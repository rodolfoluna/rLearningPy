<script lang="ts">
  import { fecha, minutos, porcentaje, Semaforo } from "@rlp/ui-comun";
  import { descargar, hoy } from "../lib/csv";
  import { actividades, alumnosVisibles, curso, nombreGrupo, prof } from "../lib/estado.svelte";
  import { completadas, csvAvance, csvDetalle, puntos } from "../lib/informes";
  import { nivelAlerta, pesoNivel } from "../lib/nivel";
  import type { AlumnoFila } from "../lib/tipos";
  import { ETIQUETAS_NIVEL } from "./etiquetas";

  type Columna = "nombre" | "control" | "grupo" | "nivel" | "avance" | "puntos" | "tiempo" | "pegados" | "sync";

  let buscar = $state("");
  let mapa = $state(false);
  let orden = $state<{ col: Columna; asc: boolean }>({ col: "nombre", asc: true });

  const total = actividades.length;
  const info = actividades.map((a) => ({ id: a.id, titulo: a.titulo, puntos: a.puntos }));
  const niveles = $derived(new Map(prof.alumnos.map((a) => [a.id, nivelAlerta(a.global)])));

  function valor(a: AlumnoFila, col: Columna): string | number {
    switch (col) {
      case "nombre":
        return a.nombre.toLowerCase();
      case "control":
        return a.control;
      case "grupo":
        return nombreGrupo(a.grupo).toLowerCase();
      case "nivel":
        return pesoNivel[niveles.get(a.id)?.nivel ?? "verde"];
      case "avance":
        return completadas(a);
      case "puntos":
        return puntos(a);
      case "tiempo":
        return a.global.tiempo_ms;
      case "pegados":
        return a.global.pegados_intentos + a.global.inserciones_sospechosas * 100;
      case "sync":
        return a.ultimaSync ?? 0;
    }
  }

  const grupoActual = $derived(alumnosVisibles());
  const visibles = $derived.by(() => {
    const q = buscar.trim().toLowerCase();
    const lista = grupoActual.filter((a) => !q || `${a.nombre} ${a.control}`.toLowerCase().includes(q));
    const { col, asc } = orden;
    return [...lista].sort((x, y) => {
      const a = valor(x, col);
      const b = valor(y, col);
      const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");
      return asc ? r : -r;
    });
  });

  const resumen = $derived({
    alumnos: grupoActual.length,
    activos: grupoActual.filter((a) => a.ultimaSync && Date.now() - a.ultimaSync < 24 * 3600_000).length,
    rojos: grupoActual.filter((a) => niveles.get(a.id)?.nivel === "rojo").length,
    amarillos: grupoActual.filter((a) => niveles.get(a.id)?.nivel === "amarillo").length,
    avance: grupoActual.length
      ? Math.round(grupoActual.reduce((s, a) => s + porcentaje(completadas(a), total), 0) / grupoActual.length)
      : 0,
  });

  function ordenar(col: Columna) {
    orden = orden.col === col ? { col, asc: !orden.asc } : { col, asc: col === "nombre" || col === "control" || col === "grupo" };
  }

  const flecha = (col: Columna) => (orden.col === col ? (orden.asc ? " ▲" : " ▼") : "");

  /** Primera actividad de cada unidad: ahí el mapa marca la separación. */
  const iniciosDeUnidad = new Set(curso.unidades.map((u) => u.lecciones.flatMap((l) => l.actividades)[0]?.id).filter(Boolean));

  function estadoCelda(a: AlumnoFila, id: string): string {
    const x = a.avance[id];
    if (!x) return "vacia";
    return x.completada ? "hecha" : "progreso";
  }

  function nombreArchivo(tipo: string) {
    const g = prof.grupoId === null ? "todos" : nombreGrupo(prof.grupoId);
    return `avance-${tipo}-${g.replace(/[^\p{L}\p{N}]+/gu, "-")}-${hoy()}.csv`;
  }

  const columnas: [Columna, string, boolean][] = [
    ["nombre", "Alumno", false],
    ["grupo", "Grupo", false],
    ["nivel", "Alerta", false],
    ["avance", "Avance", false],
    ["puntos", "Puntos", true],
  ];
</script>

<div class="pagina-profesor">
  <div class="resumen">
    <div class="tarjeta dato"><span class="valor" data-resumen="alumnos">{resumen.alumnos}</span><span class="suave">alumnos</span></div>
    <div class="tarjeta dato"><span class="valor">{resumen.activos}</span><span class="suave">conectados en 24 h</span></div>
    <div class="tarjeta dato"><span class="valor">{resumen.avance}%</span><span class="suave">avance promedio</span></div>
    <div class="tarjeta dato"><span class="valor alerta-amarilla">{resumen.amarillos}</span><span class="suave">por revisar</span></div>
    <div class="tarjeta dato"><span class="valor alerta-roja">{resumen.rojos}</span><span class="suave">con alertas</span></div>
  </div>

  <div class="fila herramientas">
    <input class="buscar" placeholder="Buscar por nombre o número de control" bind:value={buscar} aria-label="Buscar alumno" />
    <label class="fila interruptor"><input type="checkbox" bind:checked={mapa} /> Ver mapa de actividades</label>
    <span class="espaciador"></span>
    <button
      onclick={() => descargar(nombreArchivo("resumen"), csvAvance(visibles, prof.grupos, info))}
      disabled={!visibles.length}
      title="Una fila por alumno y una columna por actividad (puntos)">⬇ CSV de avance</button
    >
    <button
      onclick={() => descargar(nombreArchivo("detalle"), csvDetalle(visibles, prof.grupos, info))}
      disabled={!visibles.length}
      title="Una fila por alumno y actividad, con pruebas, intentos y calificaciones">⬇ CSV detallado</button
    >
  </div>

  {#if prof.cargando}
    <p class="suave">Cargando…</p>
  {:else if !prof.alumnos.length}
    <div class="tarjeta vacio">
      <h2>Aún no tienes alumnos</h2>
      <p class="suave">Da de alta a tus alumnos para generarles su contraseña temporal.</p>
      <button class="primario" onclick={() => (prof.vista = { tipo: "alumnos" })}>🎓 Agregar alumnos</button>
    </div>
  {:else}
    <div class="tabla-desplazable tabla">
      <table class="datos">
        <thead>
          <tr>
            {#each columnas as [col, titulo, num] (col)}
              <th class:fijo={col === "nombre"} class:num aria-sort={orden.col === col ? (orden.asc ? "ascending" : "descending") : "none"}>
                <button class="orden" onclick={() => ordenar(col)}>{titulo}{flecha(col)}</button>
              </th>
            {/each}
            {#if mapa}
              {#each curso.unidades as u (u.id)}
                <th class="unidad-cab" colspan={u.lecciones.reduce((s, l) => s + l.actividades.length, 0)}>U{u.numero}</th>
              {/each}
            {:else}
              <th class="num"><button class="orden" onclick={() => ordenar("tiempo")}>Tiempo{flecha("tiempo")}</button></th>
              <th class="num">Ejecuciones</th>
              <th class="num"><button class="orden" onclick={() => ordenar("pegados")}>Intentos de pegar{flecha("pegados")}</button></th>
              <th class="num">Salidas</th>
              <th><button class="orden" onclick={() => ordenar("sync")}>Última sincronización{flecha("sync")}</button></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each visibles as a (a.id)}
            {@const al = niveles.get(a.id) ?? { nivel: "verde" as const, motivos: [] }}
            {@const c = completadas(a)}
            <tr onclick={() => (prof.vista = { tipo: "detalle", alumnoId: a.id })} class="clic" data-alumno={a.control}>
              <td class="fijo">
                <strong>{a.nombre}</strong>
                <div class="suave chico">{a.control}{a.debeCambiarClave ? " · no ha entrado" : ""}</div>
              </td>
              <td>{nombreGrupo(a.grupo)}</td>
              <td><Semaforo nivel={al.nivel} etiquetas={ETIQUETAS_NIVEL} titulo={al.motivos.join("; ") || "Sin alertas"} /></td>
              <td>
                <div class="avance" data-avance={`${c}/${total}`}>
                  <span class="barra"><span style:width="{porcentaje(c, total)}%"></span></span>
                  <span class="chico">{c}/{total} · {porcentaje(c, total)}%</span>
                </div>
              </td>
              <td class="num" data-puntos>{puntos(a)}</td>
              {#if mapa}
                {#each actividades as act (act.id)}
                  <td class="celda {estadoCelda(a, act.id)}" class:inicio-unidad={iniciosDeUnidad.has(act.id)} title={act.titulo}></td>
                {/each}
              {:else}
                <td class="num">{minutos(a.global.tiempo_ms)}</td>
                <td class="num">{a.global.ejecuciones}</td>
                <td class="num" class:alerta={a.global.pegados_intentos > 0}>{a.global.pegados_intentos}</td>
                <td class="num">{a.global.salidas}</td>
                <td>
                  {a.ultimaSync ? fecha(a.ultimaSync) : "nunca"}
                  {#if a.ultimaSync && a.conDatosMoviles}<span class="datos-moviles" data-datos-moviles
                      title="Su último envío fue con datos móviles: su app envía los avances con Wi‑Fi o cuando el alumno lo pide">📶</span>{/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="suave chico">
      Se actualiza solo. Cada alumno envía su avance al terminar una actividad y sus contadores cada minuto mientras
      trabaja (o al recuperar la conexión).
    </p>
  {/if}
</div>

<style>
  .datos-moviles {
    font-size: 0.85em;
    cursor: help;
  }
  .resumen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.8rem;
  }
  .dato {
    display: flex;
    flex-direction: column;
    padding: 0.8rem 1rem;
  }
  .valor {
    font-size: 1.6rem;
    font-weight: 700;
  }
  .alerta-amarilla {
    color: var(--aviso);
  }
  .alerta-roja {
    color: var(--peligro);
  }
  .herramientas {
    flex-wrap: wrap;
  }
  .buscar {
    max-width: 360px;
  }
  .interruptor {
    font-weight: normal;
    margin: 0;
  }
  .interruptor input {
    width: auto;
  }
  .tabla {
    max-height: calc(100vh - 300px);
  }
  .clic {
    cursor: pointer;
  }
  .avance {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .barra {
    width: 90px;
    height: 6px;
    background: var(--superficie-2);
    border-radius: 3px;
    overflow: hidden;
  }
  .barra span {
    display: block;
    height: 100%;
    background: var(--exito);
  }
  .unidad-cab {
    text-align: center !important;
    border-left: 2px solid var(--borde);
  }
  .celda {
    padding: 0 !important;
    width: 11px;
    min-width: 11px;
    border-left: 1px solid var(--superficie);
  }
  .celda.inicio-unidad {
    border-left: 2px solid var(--borde);
  }
  .fijo {
    position: sticky;
    left: 0;
    background: var(--superficie);
    z-index: 1;
    box-shadow: 1px 0 0 var(--borde);
  }
  th.fijo {
    background: var(--superficie-2);
    z-index: 2;
  }
  tr:hover .fijo {
    background: var(--primario-suave);
  }
  .celda.hecha {
    background: var(--exito);
  }
  .celda.progreso {
    background: var(--acento);
  }
  .celda.vacia {
    background: var(--superficie-2);
  }
  .vacio {
    text-align: center;
    padding: 3rem;
  }
</style>
