<script lang="ts">
  import { Modal, mensajeError } from "@rlp/ui-comun";
  import { backend } from "../lib/backend";
  import { app, aplicarTema, avisar, curso, enviarAhora, salir } from "../lib/app.svelte";
  import { haceCuanto, RECORDATORIO_MS } from "../lib/sync";
  import IndicadorSync from "./IndicadorSync.svelte";
  import PanelSync from "./PanelSync.svelte";
  import Temario from "./Temario.svelte";
  import Bienvenida from "./Bienvenida.svelte";
  import Leccion from "./Leccion.svelte";
  import Actividad from "./Actividad.svelte";
  import Estadisticas from "./Estadisticas.svelte";
  import { ubicar } from "@rlp/curso";

  const alumno = $derived(app.alumno!);
  const g = $derived(alumno.estadisticas.global);
  let menuAbierto = $state(false);
  let temarioAbierto = $state(false);

  let errorModal = $state("");

  // Cuenta
  let modalClave = $state(false);
  let actual = $state("");
  let nueva = $state("");
  let nueva2 = $state("");

  const seleccionActividad = $derived(
    app.seleccion.tipo === "actividad" ? ubicar(curso, app.seleccion.id) : null,
  );
  const seleccionLeccion = $derived(
    app.seleccion.tipo === "leccion"
      ? curso.unidades.flatMap((u) => u.lecciones.map((l) => ({ u, l }))).find((x) => x.l.id === (app.seleccion as { id: string }).id)
      : null,
  );

  async function cambiarClave() {
    errorModal = "";
    try {
      if (nueva !== nueva2) throw new Error("Las contraseñas nuevas no coinciden.");
      await (await backend()).cambiarContrasena(actual, nueva);
      modalClave = false;
      actual = nueva = nueva2 = "";
      avisar("Contraseña actualizada.");
    } catch (e) {
      errorModal = mensajeError(e);
    }
  }

  function ir(sel: typeof app.seleccion) {
    app.seleccion = sel;
    temarioAbierto = false;
    menuAbierto = false;
  }

  // El indicador de sincronización abre el menú donde está "Enviar ahora" y el ajuste.
  function abrirSync() {
    let celular = false;
    try {
      celular = matchMedia("(max-width: 600px)").matches;
    } catch {
      /* sin matchMedia */
    }
    if (celular) {
      temarioAbierto = true;
      lateral?.scrollTo({ top: 0 }); // "Enviar ahora" está arriba, con la cuenta
    } else menuAbierto = !menuAbierto;
  }

  // Recordatorio suave (una vez por sesión): avances de hace más de 24 h sin enviar.
  const CLAVE_RECORDATORIO = "rlp-recordatorio-sync";
  let recordatorioCerrado = $state(leerSesion(CLAVE_RECORDATORIO) === "1");
  const pendientesDesde = $derived(app.red?.pendientesDesde ?? null);
  const recordatorio = $derived(
    !recordatorioCerrado &&
      app.sincronizacion === "pendiente-datos" &&
      pendientesDesde !== null &&
      Date.now() - pendientesDesde > RECORDATORIO_MS,
  );
  function leerSesion(clave: string): string | null {
    try {
      return sessionStorage.getItem(clave);
    } catch {
      return null;
    }
  }
  function cerrarRecordatorio() {
    recordatorioCerrado = true;
    try {
      sessionStorage.setItem(CLAVE_RECORDATORIO, "1");
    } catch {
      /* sin almacenamiento */
    }
  }

  function abrirClave() {
    menuAbierto = false;
    temarioAbierto = false;
    modalClave = true;
  }

  // Menús: se cierran con Escape o al tocar fuera.
  let cuenta: HTMLDivElement | undefined = $state();
  let lateral: HTMLElement | undefined = $state();
  let botonLateral: HTMLButtonElement | undefined = $state();
  function teclaGlobal(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (temarioAbierto) {
      temarioAbierto = false;
      botonLateral?.focus();
    }
    menuAbierto = false;
  }
  function clicGlobal(e: PointerEvent) {
    const t = e.target as Node;
    if (menuAbierto && cuenta && !cuenta.contains(t)) menuAbierto = false;
    if (temarioAbierto && lateral && !lateral.contains(t) && !botonLateral?.contains(t)) temarioAbierto = false;
  }
</script>

<svelte:window onkeydown={teclaGlobal} onpointerdown={clicGlobal} />

<div class="principal">
  <header class="barra">
    <button class="fantasma solo-movil hamburguesa" aria-label="Menú" aria-controls="panel-lateral" aria-expanded={temarioAbierto}
      bind:this={botonLateral} onclick={() => (temarioAbierto = !temarioAbierto)}>☰</button>
    <button class="fantasma marca" onclick={() => ir({ tipo: "inicio" })}>
      <span aria-hidden="true">🐍</span> <span class="titulo">{curso.titulo}</span>
    </button>
    <span class="espaciador"></span>
    <IndicadorSync alTocar={abrirSync} />
    <button class="fantasma contadores" onclick={() => ir({ tipo: "estadisticas" })} title="Tus estadísticas (tu profesor también las ve)">
      <span class="insignia" data-contador="copias">📋 Copias <strong>{g.copias}</strong></span>
      <span class="insignia" class:alerta={g.pegados_intentos > 0} data-contador="pegados">🚫 Intentos de pegar <strong>{g.pegados_intentos}</strong></span>
      <span class="insignia" data-contador="salidas">↗ Salidas <strong>{g.salidas}</strong></span>
    </button>
    <div class="cuenta" bind:this={cuenta}>
      <button class="fantasma" aria-label="Cuenta" aria-haspopup="menu" onclick={() => (menuAbierto = !menuAbierto)} aria-expanded={menuAbierto}>
        <span class="avatar">{alumno.perfil.nombre.slice(0, 1).toUpperCase()}</span>
        <span class="nombre">{alumno.perfil.nombre}</span> ▾
      </button>
      {#if menuAbierto}
        <div class="menu" role="menu">
          <div class="suave quien">{alumno.perfil.numero_control}{alumno.grupo ? ` · ${alumno.grupo.nombre}` : " · sin grupo"}</div>
          <PanelSync id="sync-menu" />
          <button role="menuitem" onclick={() => { menuAbierto = false; ir({ tipo: "estadisticas" }); }}>📊 Mis estadísticas</button>
          <button role="menuitem" onclick={abrirClave}>🔑 Cambiar contraseña</button>
          <button role="menuitem" onclick={() => aplicarTema(app.tema === "oscuro" ? "claro" : "oscuro")}>
            🌓 Tema {app.tema === "oscuro" ? "claro" : "oscuro"}
          </button>
          <button role="menuitem" onclick={salir}>🚪 Cerrar sesión</button>
        </div>
      {/if}
    </div>
  </header>
  {#if recordatorio && pendientesDesde !== null}
    <div class="recordatorio" role="status" data-recordatorio-sync>
      <span>📶 Tienes avances de {haceCuanto(pendientesDesde)} sin enviar.</span>
      <button class="chico primario" onclick={() => { cerrarRecordatorio(); void enviarAhora(); }}>Enviar</button>
      <button class="fantasma chico" aria-label="Cerrar recordatorio" onclick={cerrarRecordatorio}>✕</button>
    </div>
  {/if}

  <div class="cuerpo">
    <aside class="lateral" class:abierto={temarioAbierto} id="panel-lateral" bind:this={lateral}>
      <!-- En celulares la barra superior no cabe: la cuenta y los contadores viven aquí. -->
      <section class="cuenta-movil" aria-label="Tu cuenta">
        <div class="quien-movil">
          <span class="avatar">{alumno.perfil.nombre.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{alumno.perfil.nombre}</strong><br />
            <span class="suave">{alumno.perfil.numero_control}{alumno.grupo ? ` · ${alumno.grupo.nombre}` : " · sin grupo"}</span>
          </span>
        </div>
        <button class="fantasma contadores-movil" onclick={() => ir({ tipo: "estadisticas" })}>
          <span class="insignia">📋 <strong>{g.copias}</strong></span>
          <span class="insignia" class:alerta={g.pegados_intentos > 0}>🚫 <strong>{g.pegados_intentos}</strong></span>
          <span class="insignia">↗ <strong>{g.salidas}</strong></span>
          <span class="suave">Mis estadísticas</span>
        </button>
        <PanelSync id="sync-movil" />
        <button class="fantasma" onclick={abrirClave}>🔑 Cambiar contraseña</button>
        <button class="fantasma" onclick={() => aplicarTema(app.tema === "oscuro" ? "claro" : "oscuro")}>
          🌓 Tema {app.tema === "oscuro" ? "claro" : "oscuro"}
        </button>
        <button class="fantasma" onclick={salir}>🚪 Cerrar sesión</button>
      </section>
      <Temario {ir} />
    </aside>
    <main class="contenido">
      {#if app.seleccion.tipo === "actividad" && seleccionActividad}
        {#key seleccionActividad.actividad.id}
          <Actividad actividad={seleccionActividad.actividad} leccion={seleccionActividad.leccion} {ir} />
        {/key}
      {:else if seleccionLeccion}
        {#key seleccionLeccion.l.id}
          <Leccion leccion={seleccionLeccion.l} unidad={seleccionLeccion.u} {ir} />
        {/key}
      {:else if app.seleccion.tipo === "estadisticas"}
        <Estadisticas />
      {:else}
        <Bienvenida {ir} />
      {/if}
    </main>
  </div>
</div>

<Modal titulo="Cambiar contraseña" abierto={modalClave} cerrar={() => (modalClave = false)}>
  <form id="form-clave" onsubmit={(e) => { e.preventDefault(); cambiarClave(); }}>
    <div class="campo"><label for="ca">Contraseña actual</label><input id="ca" type="password" bind:value={actual} /></div>
    <div class="campo"><label for="cn">Contraseña nueva</label><input id="cn" type="password" bind:value={nueva} /></div>
    <div class="campo"><label for="cn2">Repite la contraseña nueva</label><input id="cn2" type="password" bind:value={nueva2} /></div>
    {#if errorModal}<p class="error">{errorModal}</p>{/if}
  </form>
  {#snippet acciones()}
    <button onclick={() => (modalClave = false)}>Cancelar</button>
    <button class="primario" type="submit" form="form-clave">Guardar</button>
  {/snippet}
</Modal>

<style>
  .principal {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .barra {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: var(--superficie);
    border-bottom: 1px solid var(--borde);
    min-height: 52px;
  }
  .recordatorio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.3rem 0.75rem;
    font-size: 0.88em;
    background: var(--aviso-suave);
    color: var(--aviso);
    border-bottom: 1px solid color-mix(in srgb, var(--aviso) 30%, transparent);
  }
  .recordatorio span {
    flex: 1;
    min-width: 12em;
  }
  .marca {
    font-weight: 700;
    font-size: 1.02rem;
  }
  .contadores {
    gap: 0.35rem;
    padding: 0.2em;
  }
  .insignia.alerta {
    background: var(--aviso-suave);
    color: var(--aviso);
    border-color: color-mix(in srgb, var(--aviso) 30%, transparent);
  }
  .cuenta {
    position: relative;
  }
  .avatar {
    width: 1.8em;
    height: 1.8em;
    border-radius: 50%;
    background: var(--primario);
    color: var(--primario-texto);
    display: inline-grid;
    place-items: center;
    font-weight: 700;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 50;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    padding: 0.35rem;
    min-width: 270px;
    display: flex;
    flex-direction: column;
  }
  .menu button {
    border: none;
    justify-content: flex-start;
  }
  .quien {
    padding: 0.3em 0.9em 0.5em;
    font-size: 0.88em;
    border-bottom: 1px solid var(--borde);
    margin-bottom: 0.25rem;
  }
  .cuerpo {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .lateral {
    width: 300px;
    flex: none;
    border-right: 1px solid var(--borde);
    background: var(--superficie);
    overflow-y: auto;
  }
  .contenido {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .solo-movil,
  .cuenta-movil {
    display: none;
  }
  @media (max-width: 1100px) {
    .titulo,
    .nombre {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .solo-movil {
      display: inline-flex;
    }
    .contadores .insignia:not([data-contador="pegados"]) {
      display: none;
    }
    .lateral {
      position: fixed;
      top: 52px;
      bottom: 0;
      left: 0;
      z-index: 40;
      max-width: 88vw;
      transform: translateX(-100%);
      visibility: hidden;
      transition: transform 0.2s, visibility 0.2s;
      box-shadow: 0 0 30px rgb(0 0 0 / 0.25);
    }
    .lateral.abierto {
      transform: none;
      visibility: visible;
    }
  }
  /* Celulares: en la barra solo quedan el menú, la marca y el estado de sincronización. */
  @media (max-width: 600px) {
    .barra {
      gap: 0.25rem;
      padding: 0.4rem 0.5rem;
    }
    .marca {
      min-width: 0;
      flex: 0 1 auto;
      overflow: hidden;
    }
    .titulo {
      display: inline;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .contadores,
    .cuenta {
      display: none;
    }
    .hamburguesa {
      font-size: 1.25rem;
    }
    .cuenta-movil {
      display: flex;
      flex-direction: column;
      padding: 0.6rem;
      border-bottom: 1px solid var(--borde);
      gap: 0.15rem;
    }
    .cuenta-movil > button {
      justify-content: flex-start;
      text-align: left;
    }
    .quien-movil {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      padding: 0.2rem 0.6rem 0.5rem;
      font-size: 0.92em;
      line-height: 1.3;
    }
    .contadores-movil {
      flex-wrap: wrap;
      gap: 0.35rem;
    }
  }
</style>
