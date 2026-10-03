<script lang="ts">
  import { mensajeError } from "@rlp/ui-comun";
  import { backend } from "../lib/backend";
  import { app, entrar, salir } from "../lib/app.svelte";

  let nueva = $state("");
  let nueva2 = $state("");
  let error = $state("");
  let ocupado = $state(false);

  async function guardar() {
    error = "";
    ocupado = true;
    try {
      if (nueva.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      if (nueva !== nueva2) throw new Error("Las contraseñas no coinciden.");
      if (!navigator.onLine) throw new Error("Sin conexión: necesitas internet para cambiar tu contraseña.");
      await (await backend()).cambiarContrasenaInicial(nueva);
      const alumno = app.alumno!;
      alumno.debe_cambiar_clave = false;
      entrar(alumno);
    } catch (e) {
      error = mensajeError(e);
    } finally {
      ocupado = false;
    }
  }
</script>

<main class="centro">
  <form class="tarjeta cambio" onsubmit={(e) => { e.preventDefault(); guardar(); }} data-cambiar-clave>
    <h2>Elige tu contraseña</h2>
    <p class="suave">
      Hola{app.alumno ? `, ${app.alumno.perfil.nombre.split(" ")[0]}` : ""}. Estás usando la contraseña temporal que te
      dio tu profesor: elige una nueva que solo tú conozcas.
    </p>
    <div class="campo">
      <label for="nueva">Contraseña nueva</label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="nueva" type="password" bind:value={nueva} autocomplete="new-password" autofocus />
      <p class="ayuda">Al menos 8 caracteres.</p>
    </div>
    <div class="campo">
      <label for="nueva2">Repite la contraseña nueva</label>
      <input id="nueva2" type="password" bind:value={nueva2} autocomplete="new-password" />
    </div>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="fila">
      <button type="button" class="fantasma chico" onclick={salir}>Salir</button>
      <span class="espaciador"></span>
      <button type="submit" class="primario" disabled={ocupado}>Guardar y continuar</button>
    </div>
  </form>
</main>

<style>
  .cambio {
    max-width: 440px;
    width: 100%;
  }
  .cambio h2 {
    margin-top: 0;
  }
</style>
