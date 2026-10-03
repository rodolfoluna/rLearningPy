<script lang="ts">
  import { mensajeError } from "@rlp/ui-comun";
  import { backend } from "../lib/backend";
  import { app, cargarEstadoApp, curso, entrarSesion } from "../lib/app.svelte";
  import IndicadorSync from "./IndicadorSync.svelte";

  const estadoApp = $derived(app.estadoApp!);
  let modo: "entrar" | "configurar" = $state("entrar");
  let error = $state("");
  let ocupado = $state(false);

  let usuario = $state("");
  let contrasena = $state("");

  // Configuración inicial del profesor
  let correo = $state("");
  let clave1 = $state("");
  let clave2 = $state("");

  async function accion(fn: () => Promise<void>) {
    error = "";
    ocupado = true;
    try {
      await fn();
    } catch (e) {
      error = mensajeError(e);
    } finally {
      ocupado = false;
    }
  }

  const iniciar = () =>
    accion(async () => {
      if (!usuario.trim()) throw new Error("Escribe tu número de control.");
      if (!contrasena) throw new Error("Escribe tu contraseña.");
      if (!navigator.onLine) throw new Error("Sin conexión. La primera vez necesitas internet para entrar.");
      const s = await (await backend()).iniciarSesion(usuario, contrasena);
      contrasena = "";
      entrarSesion(s);
    });

  const configurar = () =>
    accion(async () => {
      if (!correo.includes("@")) throw new Error("Escribe tu correo.");
      if (clave1 !== clave2) throw new Error("Las contraseñas no coinciden.");
      await (await backend()).configurarProfesor(correo, clave1);
      await cargarEstadoApp();
      entrarSesion({ rol: "profesor" });
    });
</script>

<main class="inicio">
  <section class="portada">
    <div class="logo" aria-hidden="true">🐍</div>
    <h1>{curso.titulo}</h1>
    <p class="suave">{curso.descripcion}</p>
    <p class="suave pie">
      Entra con el número de control y la contraseña que te dio tu profesor. Después de la primera vez puedes
      trabajar sin internet: tus avances se guardan en este equipo y se envían solos al volver la conexión.
    </p>
  </section>

  <section class="tarjeta formulario">
    {#if modo === "entrar"}
      <form onsubmit={(e) => { e.preventDefault(); iniciar(); }} data-login>
        <h2>Entrar</h2>
        <div class="campo">
          <label for="usuario">Número de control</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="usuario" bind:value={usuario} autocomplete="username" autocapitalize="off" spellcheck="false" autofocus />
          <p class="ayuda">Profesor: escribe tu correo.</p>
        </div>
        <div class="campo">
          <label for="clave">Contraseña</label>
          <input id="clave" type="password" bind:value={contrasena} autocomplete="current-password" />
        </div>
        {#if error}<p class="error">{error}</p>{/if}
        <div class="fila">
          <span class="espaciador"></span>
          <button type="submit" class="primario" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
        </div>
        <p class="suave chico">¿Olvidaste tu contraseña? Pídele a tu profesor que la restablezca.</p>
      </form>
      {#if estadoApp.hay_profesor === false}
        <button type="button" class="fantasma chico enlace" onclick={() => { modo = "configurar"; error = ""; }}>
          Configurar la app por primera vez (profesor)
        </button>
      {/if}
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); configurar(); }} data-configurar>
        <h2>Configurar profesor</h2>
        <p class="suave">
          Esto se hace una sola vez: crea la cuenta del profesor. Después nadie más podrá registrarse como profesor.
        </p>
        <div class="campo">
          <label for="correo">Tu correo</label>
          <input id="correo" type="email" bind:value={correo} autocomplete="email" />
        </div>
        <div class="campo">
          <label for="c1">Contraseña</label>
          <input id="c1" type="password" bind:value={clave1} autocomplete="new-password" />
          <p class="ayuda">Al menos 8 caracteres.</p>
        </div>
        <div class="campo">
          <label for="c2">Repite la contraseña</label>
          <input id="c2" type="password" bind:value={clave2} autocomplete="new-password" />
        </div>
        {#if error}<p class="error">{error}</p>{/if}
        <div class="fila">
          <button type="button" class="fantasma chico" onclick={() => { modo = "entrar"; error = ""; }}>← Volver</button>
          <span class="espaciador"></span>
          <button type="submit" class="primario" disabled={ocupado}>Crear cuenta de profesor</button>
        </div>
      </form>
    {/if}
  </section>
  <p class="version suave">
    v{estadoApp.version} · {estadoApp.plataforma}{estadoApp.dev ? " · compilación de desarrollo" : ""}
    <IndicadorSync />
  </p>
</main>

<style>
  .inicio {
    min-height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
    gap: 2.5rem;
    align-items: center;
    max-width: 1080px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
    position: relative;
  }
  .logo {
    font-size: 3rem;
  }
  .portada h1 {
    font-size: 2rem;
  }
  .pie {
    margin-top: 1.5em;
    font-size: 0.9em;
  }
  .formulario h2 {
    margin-top: 0;
  }
  .chico {
    font-size: 0.85em;
  }
  .enlace {
    margin-top: 0.8rem;
    width: 100%;
    justify-content: center;
    white-space: normal;
  }
  .version {
    position: absolute;
    bottom: 0.5rem;
    right: 1.5rem;
    margin: 0;
    font-size: 0.8em;
    display: flex;
    gap: 0.75em;
    align-items: center;
  }
  @media (max-width: 860px) {
    .inicio {
      grid-template-columns: 1fr;
      gap: 1rem;
      padding: 1rem;
    }
    .version {
      position: static;
    }
  }
</style>
