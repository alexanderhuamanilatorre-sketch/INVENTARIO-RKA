import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { AuthService } from "../auth/auth-core.js";
import { NotificationModal } from "../core/notifications.js";

(function initPermisosModule() {
  const authService = new AuthService();

  const NOMBRES_ROL = {
    administrador: "Administrador",
    jefe_general: "Jefe General",
    jefa_tienda: "Jefa de Tienda",
    subjefe_tienda: "Subjefe de Tienda",
    personal_almacen: "Personal de Almacén",
    vendedor: "Vendedor",
    cliente: "Cliente",
  };

  // Roles que no se ofrecen en el selector "Rol a configurar".
  const ROLES_NO_CONFIGURABLES = new Set(["cliente", "vendedor"]);

  const state = {
    roles: [],
    secciones: [],
    permisos: new Map(),
    original: new Map(),
    selectedRoleId: null,
    role: null,
    version: 0,
    dirty: false,
    expanded: new Set(),
    view: "rol",
    matrix: null,
    saving: false,
  };

  const $ = (id) => document.getElementById(id);

  const selectRol = $("selectRol");
  const tbodyPermisos = $("tbodyPermisos");
  const btnGuardar = $("btnGuardar");
  const btnDescartar = $("btnDescartar");
  const savebar = $("rbacSavebar");
  const txtCambios = $("txtCambios");
  const modalGuardar = $("modalGuardar");
  const btnConfirmarGuardar = $("btnConfirmarGuardar");
  const chkConfirmarRevocacion = $("chkConfirmarRevocacion");
  const wrapConfirmarRevocacion = $("wrapConfirmarRevocacion");
  const inputMotivo = $("inputMotivo");
  const modalNuevoRol = $("modalNuevoRol");
  const formNuevoRol = $("formNuevoRol");
  const selectClonar = $("selectClonar");
  const modalHistorial = $("modalHistorial");
  const listaHistorial = $("listaHistorial");
  const vistaRol = $("vistaRol");
  const vistaMatriz = $("vistaMatriz");
  const matrizHead = $("matrizHead");
  const matrizBody = $("matrizBody");
  const rbacEmpty = $("rbacEmpty");

  // ------------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------------
  function escapar(texto) {
    return String(texto ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatearFecha(valor) {
    if (!valor) return "—";
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return "—";
    return fecha.toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function etiquetaRol(rol) {
    if (!rol) return "—";
    if (typeof rol === "string") {
      return NOMBRES_ROL[rol.toLowerCase()] || rol;
    }
    return NOMBRES_ROL[String(rol.codigo || "").toLowerCase()] || rol.nombre || rol.codigo || "—";
  }

  async function api(ruta, opciones = {}) {
    const respuesta = await fetch(ruta, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(opciones.headers || {}),
      },
      ...opciones,
    });

    if (respuesta.status === 401) {
      window.location.replace("../auth/login.html");
      throw new Error("Sesión expirada.");
    }

    let data = null;
    try {
      data = await respuesta.json();
    } catch (_err) {
      data = null;
    }

    if (!respuesta.ok) {
      const error = new Error(data?.error || "No se pudo completar la operación.");
      error.status = respuesta.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function copiarMapa(mapa) {
    return new Map(
      Array.from(mapa.entries()).map(([id, valor]) => [id, { ...valor }])
    );
  }

  function rolActual() {
    return state.roles.find((r) => r.idRol === state.selectedRoleId) || state.role;
  }

  function buildTree() {
    const byId = new Map(
      state.secciones.map((s) => [s.idSeccion, { ...s, hijos: [] }])
    );
    const roots = [];
    for (const seccion of byId.values()) {
      if (seccion.idPadre && byId.has(seccion.idPadre)) {
        byId.get(seccion.idPadre).hijos.push(seccion);
      } else {
        roots.push(seccion);
      }
    }
    return { roots, byId };
  }

  function ancestroBloqueado(seccion, permisos = state.permisos, byId = null) {
    const mapa = byId || new Map(state.secciones.map((s) => [s.idSeccion, s]));
    let padreId = seccion.idPadre;
    let profundidad = 0;

    while (padreId && mapa.has(padreId) && profundidad < 50) {
      const padre = mapa.get(padreId);
      const permiso = permisos.get(padreId);
      if (!permiso?.puedeAcceder) return true;
      padreId = padre.idPadre;
      profundidad += 1;
    }
    return false;
  }

  function habilitarAncestros(idSeccion) {
    const byId = new Map(state.secciones.map((s) => [s.idSeccion, s]));
    let actual = byId.get(idSeccion);
    let profundidad = 0;

    while (actual?.idPadre && profundidad < 50) {
      const padre = byId.get(actual.idPadre);
      if (!padre) break;
      const permiso = state.permisos.get(padre.idSeccion);
      if (permiso) {
        permiso.puedeVer = true;
        permiso.puedeAcceder = true;
      }
      actual = padre;
      profundidad += 1;
    }
  }

  /**
   * Una sección es necesaria si es ancestro de una sección protegida que el
   * rol ya puede usar. Quitarle el acceso dejaría el panel inaccesible.
   */
  function esAncestroDeProtegidaConAcceso(idSeccion) {
    const byId = new Map(state.secciones.map((s) => [s.idSeccion, s]));
    for (const seccion of state.secciones) {
      if (!seccion.esProtegida) continue;
      const permiso = state.permisos.get(seccion.idSeccion);
      if (!permiso?.puedeAcceder) continue;

      let padreId = seccion.idPadre;
      let profundidad = 0;
      while (padreId && byId.has(padreId) && profundidad < 50) {
        if (padreId === idSeccion) return true;
        padreId = byId.get(padreId).idPadre;
        profundidad += 1;
      }
    }
    return false;
  }

  function estadoSeccion(seccion) {
    if (seccion.esProtegida) return "protegida";

    const permiso = state.permisos.get(seccion.idSeccion);
    if (!permiso?.puedeAcceder) return "sin-acceso";
    if (ancestroBloqueado(seccion)) return "bloqueada";
    if (permiso.puedeVer) return "visible";
    return "solo-acceso";
  }

  function badgeEstado(seccion) {
    const estado = estadoSeccion(seccion);
    if (estado === "protegida") {
      return `<span class="rbac-badge rbac-badge--protected"><i class="bi bi-lock-fill"></i> Protegido</span>`;
    }
    if (estado === "bloqueada") {
      return `<span class="rbac-badge rbac-badge--blocked"><i class="bi bi-dash-circle"></i> Heredado: bloqueado</span>`;
    }
    if (estado === "visible") {
      return `<span class="rbac-badge rbac-badge--ok"><i class="bi bi-check2"></i> Visible y acceso</span>`;
    }
    if (estado === "solo-acceso") {
      return `<span class="rbac-badge rbac-badge--hidden"><i class="bi bi-eye-slash"></i> Solo acceso</span>`;
    }
    return `<span class="rbac-badge rbac-badge--none"><i class="bi bi-dash"></i> Sin acceso</span>`;
  }

  function coincide(seccion) {
    const texto = $("inputBuscar").value.trim().toLowerCase();
    const filtro = $("selectFiltro").value;

    const coincideTexto =
      !texto ||
      seccion.nombre.toLowerCase().includes(texto) ||
      seccion.codigo.toLowerCase().includes(texto);

    let coincideFiltro = true;
    const permiso = state.permisos.get(seccion.idSeccion);

    if (filtro === "modulos") coincideFiltro = !seccion.idPadre;
    if (filtro === "subsecciones") coincideFiltro = Boolean(seccion.idPadre);
    if (filtro === "acceso") coincideFiltro = Boolean(permiso?.puedeAcceder);
    if (filtro === "sin-acceso") coincideFiltro = !permiso?.puedeAcceder;
    if (filtro === "protegidas") coincideFiltro = Boolean(seccion.esProtegida);

    return coincideTexto && coincideFiltro;
  }

  function construirVisibles() {
    const visibles = new Set();
    const byId = new Map(state.secciones.map((s) => [s.idSeccion, s]));

    for (const seccion of state.secciones) {
      if (!coincide(seccion)) continue;
      visibles.add(seccion.idSeccion);

      let padreId = seccion.idPadre;
      let profundidad = 0;
      while (padreId && byId.has(padreId) && profundidad < 50) {
        visibles.add(padreId);
        padreId = byId.get(padreId).idPadre;
        profundidad += 1;
      }
    }

    return visibles;
  }

  function construirVisiblesMatriz(roles) {
    const visibles = new Set();
    const byId = new Map(state.matrix?.secciones?.map((s) => [s.idSeccion, s]) || []);
    const texto = $("inputBuscar").value.trim().toLowerCase();
    const filtro = $("selectFiltro").value;

    for (const seccion of state.matrix?.secciones || []) {
      const coincideTexto =
        !texto ||
        seccion.nombre.toLowerCase().includes(texto) ||
        seccion.codigo.toLowerCase().includes(texto);
      if (!coincideTexto) continue;

      let coincideFiltro = true;
      if (filtro === "modulos") coincideFiltro = !seccion.idPadre;
      if (filtro === "subsecciones") coincideFiltro = Boolean(seccion.idPadre);
      if (filtro === "protegidas") coincideFiltro = Boolean(seccion.esProtegida);
      if (filtro === "acceso" || filtro === "sin-acceso") {
        const alguno = roles.some((rol) => {
          const { estado } = calcularPermisoMatriz(rol, seccion);
          return estado === "full" || estado === "hidden";
        });
        coincideFiltro = filtro === "acceso" ? alguno : !alguno;
      }
      if (!coincideFiltro) continue;

      visibles.add(seccion.idSeccion);
      let padreId = seccion.idPadre;
      let profundidad = 0;
      while (padreId && byId.has(padreId) && profundidad < 50) {
        visibles.add(padreId);
        padreId = byId.get(padreId).idPadre;
        profundidad += 1;
      }
    }

    return visibles;
  }

  // ------------------------------------------------------------------------
  // Render de la vista por rol
  // ------------------------------------------------------------------------
  function renderTabla() {
    const { roots, byId } = buildTree();
    const visibles = construirVisibles();
    const hayFiltro =
      $("inputBuscar").value.trim() !== "" || $("selectFiltro").value !== "todos";
    const profundidad = new Map();
    const filas = [];

    function calcularProfundidad(nodo, nivel) {
      profundidad.set(nodo.idSeccion, nivel);
      for (const hijo of nodo.hijos) calcularProfundidad(hijo, nivel + 1);
    }
    for (const raiz of roots) calcularProfundidad(raiz, 0);

    function renderNodo(nodo) {
      if (!visibles.has(nodo.idSeccion)) return;

      const tieneHijos = nodo.hijos.length > 0;
      const abierto = hayFiltro || state.expanded.has(nodo.idSeccion);
      const permiso = state.permisos.get(nodo.idSeccion) || {
        puedeVer: false,
        puedeAcceder: false,
      };
      const nivel = profundidad.get(nodo.idSeccion) || 0;
      const bloqueada = estadoSeccion(nodo) === "bloqueada";
      const protegida = Boolean(nodo.esProtegida);
      const requerida = !protegida && esAncestroDeProtegidaConAcceso(nodo.idSeccion);
      const bloqueadoSwitch = protegida || requerida;
      const tituloSwitch = protegida
        ? "Permiso protegido"
        : requerida
          ? "Sección necesaria para el panel de permisos"
          : "Mostrar u ocultar del menú";

      filas.push(`
        <tr class="rbac-row ${nivel === 0 ? "rbac-row--module" : "rbac-row--child"} ${bloqueada ? "rbac-row--blocked" : ""}" data-id="${nodo.idSeccion}">
          <td>
            <div class="rbac-section-name" style="--nivel:${nivel}">
              ${
                tieneHijos
                  ? `<button type="button" class="rbac-tree-toggle" data-toggle="${nodo.idSeccion}" aria-expanded="${abierto}" aria-label="${abierto ? "Contraer" : "Expandir"} ${escapar(nodo.nombre)}"><i class="bi ${abierto ? "bi-chevron-down" : "bi-chevron-right"}"></i></button>`
                  : `<span class="rbac-tree-toggle rbac-tree-toggle--placeholder"></span>`
              }
              <span class="rbac-section-name__icon"><i class="bi ${escapar(nodo.icono || "bi-folder2")}"></i></span>
              <span class="rbac-section-name__text">
                <span class="rbac-section-name__label">${escapar(nodo.nombre)} ${protegida ? '<i class="bi bi-lock-fill rbac-lock" title="Sección protegida"></i>' : ""}</span>
                <span class="rbac-section-name__code">${escapar(nodo.codigo)}</span>
              </span>
            </div>
          </td>
          <td class="rbac-col-switch">
            <button
              type="button"
              class="rbac-switch ${permiso.puedeVer ? "is-on" : ""} ${bloqueadoSwitch ? "rbac-switch--locked" : ""}"
              role="switch"
              aria-checked="${Boolean(permiso.puedeVer)}"
              aria-label="Visible en menú: ${escapar(nodo.nombre)}"
              data-switch="ver"
              data-id="${nodo.idSeccion}"
              ${bloqueadoSwitch ? "disabled" : ""}
              title="${protegida ? "Permiso protegido" : requerida ? "Sección necesaria para el panel de permisos" : "Mostrar u ocultar del menú"}"
            ></button>
          </td>
          <td class="rbac-col-switch">
            <button
              type="button"
              class="rbac-switch ${permiso.puedeAcceder ? "is-on" : ""} ${bloqueadoSwitch ? "rbac-switch--locked" : ""}"
              role="switch"
              aria-checked="${Boolean(permiso.puedeAcceder)}"
              aria-label="Acceso permitido: ${escapar(nodo.nombre)}"
              data-switch="acceder"
              data-id="${nodo.idSeccion}"
              ${bloqueadoSwitch ? "disabled" : ""}
              title="${protegida ? "Permiso protegido" : requerida ? "Sección necesaria para el panel de permisos" : "Permitir ruta y API de esta sección"}"
            ></button>
          </td>
          <td class="rbac-col-estado">${badgeEstado(nodo)}</td>
        </tr>
      `);

      if (tieneHijos && abierto) {
        for (const hijo of nodo.hijos) renderNodo(hijo);
      }
    }

    for (const raiz of roots) renderNodo(raiz);

    tbodyPermisos.innerHTML = filas.length
      ? filas.join("")
      : `<tr><td colspan="4"><div class="rbac-empty" style="border:0;padding:2.5rem 1rem;"><i class="bi bi-search"></i><h2>Sin coincidencias</h2><p>Prueba con otro término o filtro.</p></div></td></tr>`;

    tbodyPermisos.querySelectorAll("[data-toggle]").forEach((boton) => {
      boton.addEventListener("click", () => {
        const id = Number(boton.dataset.toggle);
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        renderTabla();
      });
    });

    tbodyPermisos.querySelectorAll("[data-switch]").forEach((boton) => {
      boton.addEventListener("click", () => {
        cambiarPermiso(
          Number(boton.dataset.id),
          boton.dataset.switch,
          !boton.classList.contains("is-on")
        );
      });
    });

    // El mapa byId se usa para el cálculo de ancestros; se pasa por el closure
    // de estadoSeccion, que reconstruye el mapa. Se conserva para claridad.
    void byId;
  }

  function cambiarPermiso(idSeccion, campo, activo) {
    const seccion = state.secciones.find((s) => s.idSeccion === idSeccion);
    if (!seccion || seccion.esProtegida) return;
    if (!activo && esAncestroDeProtegidaConAcceso(idSeccion)) {
      NotificationModal.info(
        "Esta sección es necesaria para acceder al panel de permisos. No puedes quitarle el acceso mientras el rol administre permisos."
      );
      return;
    }

    const permiso = state.permisos.get(idSeccion) || {
      puedeVer: false,
      puedeAcceder: false,
    };

    if (campo === "ver") {
      permiso.puedeVer = activo;
      if (activo) {
        permiso.puedeAcceder = true;
        habilitarAncestros(idSeccion);
      } else {
        permiso.puedeAcceder = false;
      }
    } else {
      permiso.puedeAcceder = activo;
      if (!activo) permiso.puedeVer = false;
      else habilitarAncestros(idSeccion);
    }

    state.permisos.set(idSeccion, permiso);
    actualizarEstadoGuardado();
    renderTabla();
    actualizarMetaRol();
  }

  // ------------------------------------------------------------------------
  // Cambios, guardado y descarte
  // ------------------------------------------------------------------------
  function calcularCambios() {
    const cambios = [];
    for (const seccion of state.secciones) {
      const antes = state.original.get(seccion.idSeccion) || {
        puedeVer: false,
        puedeAcceder: false,
      };
      const despues = state.permisos.get(seccion.idSeccion) || {
        puedeVer: false,
        puedeAcceder: false,
      };
      if (
        Boolean(antes.puedeVer) !== Boolean(despues.puedeVer) ||
        Boolean(antes.puedeAcceder) !== Boolean(despues.puedeAcceder)
      ) {
        cambios.push({ seccion, antes, despues });
      }
    }
    return cambios;
  }

  function actualizarEstadoGuardado() {
    const cambios = calcularCambios();
    state.dirty = cambios.length > 0;

    if (state.dirty) {
      savebar.hidden = false;
      txtCambios.textContent = `${cambios.length} cambio${cambios.length === 1 ? "" : "s"} sin guardar`;
      btnGuardar.disabled = false;
    } else {
      savebar.hidden = true;
      btnGuardar.disabled = true;
    }

    const hayAcceso = state.secciones.some((seccion) => {
      const permiso = state.permisos.get(seccion.idSeccion);
      return Boolean(permiso?.puedeAcceder) && !ancestroBloqueado(seccion);
    });
    $("rbacSinAccesos").hidden = hayAcceso || !state.selectedRoleId;
  }

  function actualizarMetaRol() {
    const rol = rolActual();
    if (!rol) {
      $("metaUsuarios").textContent = "—";
      $("metaEstado").textContent = "—";
      $("metaUltima").textContent = "—";
      return;
    }

    $("metaUsuarios").textContent = String(rol.usuariosActivos ?? 0);
    const estado = String(rol.estado || "").toLowerCase();
    const clase =
      estado === "activo"
        ? "rbac-badge--ok"
        : estado === "borrador"
          ? "rbac-badge--hidden"
          : "rbac-badge--none";
    $("metaEstado").innerHTML = `<span class="rbac-badge ${clase}">${escapar(estado || "—")}</span>`;
    $("metaUltima").textContent = formatearFecha(rol.actualizadoEn);

    const btnEstado = $("btnEstadoRol");
    const txtEstado = $("txtEstadoRol");
    if (rol.esSistema) {
      btnEstado.hidden = true;
    } else {
      btnEstado.hidden = false;
      const activar = estado !== "activo";
      txtEstado.textContent = activar ? "Activar rol" : "Desactivar rol";
      btnEstado.dataset.accion = activar ? "activar" : "desactivar";
      btnEstado.querySelector("i").className = activar
        ? "bi bi-toggle-on"
        : "bi bi-toggle-off";
    }
  }

  function abrirModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("overflow-hidden");
    modal.querySelector("button, input, select, textarea")?.focus();
  }

  function cerrarModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("overflow-hidden");
  }

  function abrirConfirmacionGuardar() {
    if (!state.dirty || state.saving) return;
    const cambios = calcularCambios();
    if (!cambios.length) return;

    const rol = rolActual();
    const otorgados = cambios.filter(
      (c) => !c.antes.puedeAcceder && c.despues.puedeAcceder
    ).length;
    const revocados = cambios.filter(
      (c) => c.antes.puedeAcceder && !c.despues.puedeAcceder
    ).length;
    const ocultados = cambios.filter(
      (c) => c.antes.puedeVer && !c.despues.puedeVer
    ).length;

    $("subtituloModalGuardar").textContent = `Rol: ${etiquetaRol(rol)} · ${rol?.usuariosActivos ?? 0} usuario(s) activo(s)`;
    $("impactoGuardar").innerHTML = `
      <strong>Resumen del cambio</strong>
      <ul>
        <li>${cambios.length} sección(es) modificada(s)</li>
        <li>${otorgados} acceso(s) otorgado(s)</li>
        <li>${revocados} acceso(s) revocado(s)</li>
        <li>${ocultados} sección(es) ocultada(s) del menú</li>
      </ul>
    `;

    const revocadas = cambios.filter(
      (c) => c.antes.puedeAcceder && !c.despues.puedeAcceder
    );
    const bloqueRevocadas = $("seccionesRevocadas");
    if (revocadas.length) {
      bloqueRevocadas.hidden = false;
      bloqueRevocadas.innerHTML = `
        <strong>Secciones que pierden acceso</strong>
        <ul>${revocadas.map((c) => `<li>${escapar(c.seccion.nombre)} <span class="rbac-section-name__code">${escapar(c.seccion.codigo)}</span></li>`).join("")}</ul>
      `;
      wrapConfirmarRevocacion.hidden = false;
      chkConfirmarRevocacion.checked = false;
    } else {
      bloqueRevocadas.hidden = true;
      wrapConfirmarRevocacion.hidden = true;
      chkConfirmarRevocacion.checked = true;
    }

    inputMotivo.value = "";
    btnConfirmarGuardar.disabled = revocadas.length > 0;
    abrirModal("modalGuardar");
  }

  async function guardarCambios() {
    if (state.saving) return;
    if (!chkConfirmarRevocacion.checked) return;

    state.saving = true;
    btnConfirmarGuardar.disabled = true;
    btnConfirmarGuardar.querySelector(".btn-text").classList.add("d-none");
    btnConfirmarGuardar.querySelector(".btn-spinner").classList.remove("d-none");

    try {
      const permisos = state.secciones.map((s) => {
        const p = state.permisos.get(s.idSeccion) || {
          puedeVer: false,
          puedeAcceder: false,
        };
        return {
          idSeccion: s.idSeccion,
          ver: Boolean(p.puedeVer),
          acceder: Boolean(p.puedeAcceder),
        };
      });

      const data = await api(`/api/rbac/roles/${state.selectedRoleId}/permisos`, {
        method: "PUT",
        body: JSON.stringify({
          version: state.version,
          motivo: inputMotivo.value.trim() || null,
          permisos,
        }),
      });

      state.version = data.version ?? state.version;
      state.original = copiarMapa(state.permisos);
      state.dirty = false;
      cerrarModal("modalGuardar");
      renderTabla();
      actualizarEstadoGuardado();
      actualizarMetaRol();

      const nuevoRol = state.roles.find((r) => r.idRol === state.selectedRoleId);
      if (nuevoRol) nuevoRol.actualizadoEn = new Date().toISOString();

      NotificationModal.success(
        data.sinCambios
          ? "No había cambios que guardar."
          : `Permisos de ${etiquetaRol(rolActual())} actualizados correctamente.`
      );
    } catch (err) {
      if (err.status === 409) {
        cerrarModal("modalGuardar");
        await NotificationModal.error(
          "Otro usuario modificó estos permisos. Se recargará la matriz para evitar sobreescrituras."
        );
        await cargarPermisosRol(state.selectedRoleId, { force: true });
      } else {
        NotificationModal.error(err.data?.mensaje || err.message);
        btnConfirmarGuardar.disabled = false;
      }
    } finally {
      state.saving = false;
      btnConfirmarGuardar.querySelector(".btn-text").classList.remove("d-none");
      btnConfirmarGuardar.querySelector(".btn-spinner").classList.add("d-none");
    }
  }

  async function descartarCambios() {
    if (!state.dirty) return;
    const ok = await NotificationModal.confirm(
      "Se perderán los cambios no guardados de esta matriz.",
      { titulo: "Descartar cambios", textoAceptar: "Descartar", textoCancelar: "Seguir editando" }
    );
    if (!ok) return;
    state.permisos = copiarMapa(state.original);
    actualizarEstadoGuardado();
    renderTabla();
    actualizarMetaRol();
  }

  // ------------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------------
  async function cargarPermisosRol(idRol, opciones = {}) {
    if (!opciones.force && state.dirty) {
      const ok = await NotificationModal.confirm(
        "Hay cambios sin guardar. Si cambias de rol se descartarán.",
        { titulo: "Cambiar de rol", textoAceptar: "Cambiar", textoCancelar: "Cancelar" }
      );
      if (!ok) {
        selectRol.value = String(state.selectedRoleId);
        return false;
      }
    }

    const data = await api(`/api/rbac/roles/${idRol}/permisos`);
    state.selectedRoleId = idRol;
    state.role = data.rol;
    state.version = data.version;
    state.secciones = data.secciones || [];
    state.permisos = new Map(
      (data.permisos || []).map((p) => [
        p.idSeccion,
        { puedeVer: Boolean(p.puedeVer), puedeAcceder: Boolean(p.puedeAcceder) },
      ])
    );
    for (const seccion of state.secciones) {
      if (!state.permisos.has(seccion.idSeccion)) {
        state.permisos.set(seccion.idSeccion, {
          puedeVer: false,
          puedeAcceder: false,
        });
      }
    }
    state.original = copiarMapa(state.permisos);
    state.expanded = new Set(
      state.secciones.filter((s) => !s.idPadre).map((s) => s.idSeccion)
    );
    state.dirty = false;

    selectRol.value = String(idRol);
    $("rbacEmpty").hidden = true;
    $("vistaRol").hidden = false;
    $("rbacSinAccesos").hidden = true;

    renderTabla();
    actualizarEstadoGuardado();
    actualizarMetaRol();
    return true;
  }

  async function cargarRoles() {
    state.roles = await api("/api/rbac/roles");
    const otros = state.roles.filter(
      (r) => !r.esPropio && !ROLES_NO_CONFIGURABLES.has(r.codigo)
    );

    selectRol.innerHTML = "";
    selectClonar.innerHTML = `<option value="">Sin clonar</option>`;

    for (const rol of otros) {
      const option = document.createElement("option");
      option.value = String(rol.idRol);
      option.textContent = `${etiquetaRol(rol)}${rol.estado !== "activo" ? ` (${rol.estado})` : ""}`;
      selectRol.appendChild(option);
    }

    for (const rol of state.roles) {
      const option = document.createElement("option");
      option.value = String(rol.idRol);
      option.textContent = `${etiquetaRol(rol)}${rol.esPropio ? " (tu rol, no editable)" : ""}`;
      selectClonar.appendChild(option);
    }

    if (!otros.length) {
      rbacEmpty.hidden = false;
      vistaRol.hidden = true;
      $("vistaMatriz").hidden = true;
      savebar.hidden = true;
      selectRol.disabled = true;
      return;
    }

    selectRol.disabled = false;
    const inicial = otros[0].idRol;
    await cargarPermisosRol(inicial, { force: true });
  }

  // ------------------------------------------------------------------------
  // Nuevo rol y estado
  // ------------------------------------------------------------------------
  function abrirNuevoRol() {
    formNuevoRol.reset();
    const nombre = $("inputNuevoNombre");
    const codigo = $("inputNuevoCodigo");
    delete codigo.dataset.editado;

    nombre.oninput = () => {
      if (codigo.dataset.editado) return;
      codigo.value = nombre.value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50);
    };

    codigo.oninput = () => {
      codigo.dataset.editado = "1";
    };

    abrirModal("modalNuevoRol");
  }

  async function crearRol(event) {
    event.preventDefault();
    const boton = $("btnCrearRol");
    const nombre = $("inputNuevoNombre").value.trim();
    const codigo = $("inputNuevoCodigo").value.trim().toLowerCase();
    const descripcion = $("inputNuevaDescripcion").value.trim();
    const clonarDe = selectClonar.value ? Number(selectClonar.value) : null;

    if (!/^[a-z][a-z0-9_]{2,49}$/.test(codigo)) {
      NotificationModal.error(
        "El código debe iniciar con una letra y usar minúsculas, números o guion bajo."
      );
      return;
    }

    boton.disabled = true;
    boton.querySelector(".btn-text").classList.add("d-none");
    boton.querySelector(".btn-spinner").classList.remove("d-none");

    try {
      const rol = await api("/api/rbac/roles", {
        method: "POST",
        body: JSON.stringify({ nombre, codigo, descripcion, clonarDe }),
      });

      cerrarModal("modalNuevoRol");
      await cargarRoles();
      await cargarPermisosRol(rol.idRol, { force: true });
      NotificationModal.success(
        `Rol "${etiquetaRol(rol)}" creado en borrador. Configura sus accesos y actívalo cuando esté listo.`
      );
    } catch (err) {
      NotificationModal.error(err.data?.error || err.message);
    } finally {
      boton.disabled = false;
      boton.querySelector(".btn-text").classList.remove("d-none");
      boton.querySelector(".btn-spinner").classList.add("d-none");
    }
  }

  async function cambiarEstadoRol() {
    const rol = rolActual();
    if (!rol) return;
    const accion = $("btnEstadoRol").dataset.accion;
    const esActivar = accion === "activar";
    const usuarios = rol.usuariosActivos ?? 0;

    if (!esActivar && usuarios > 0) {
      await NotificationModal.info(
        `El rol "${etiquetaRol(rol)}" tiene ${usuarios} usuario(s) activo(s). Reasígnalos a otro rol antes de desactivarlo.`,
        { titulo: "No se puede desactivar" }
      );
      return;
    }

    const ok = await NotificationModal.confirm(
      esActivar
        ? `El rol "${etiquetaRol(rol)}" podrá ser asignado a usuarios y sus integrantes recuperarán acceso.`
        : `El rol "${etiquetaRol(rol)}" quedará inactivo. No tiene usuarios activos asignados.`,
      {
        titulo: esActivar ? "Activar rol" : "Desactivar rol",
        tipo: esActivar ? "info" : "danger",
        textoAceptar: esActivar ? "Activar" : "Desactivar",
      }
    );
    if (!ok) return;

    try {
      await api(`/api/rbac/roles/${rol.idRol}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: esActivar ? "activo" : "inactivo" }),
      });
      await cargarRoles();
      await cargarPermisosRol(rol.idRol, { force: true });
      NotificationModal.success(
        `Rol ${esActivar ? "activado" : "desactivado"} correctamente.`
      );
    } catch (err) {
      NotificationModal.error(err.data?.mensaje || err.data?.error || err.message);
    }
  }

  // ------------------------------------------------------------------------
  // Matriz
  // ------------------------------------------------------------------------
  function calcularPermisoMatriz(item, seccion) {
    const byId = new Map(state.matrix.secciones.map((s) => [s.idSeccion, s]));
    const permisos = new Map();
    for (const p of state.matrix.permisos) {
      if (p.idRol === item.idRol) {
        permisos.set(p.idSeccion, {
          puedeVer: p.puedeVer,
          puedeAcceder: p.puedeAcceder,
        });
      }
    }

    const propio = permisos.get(seccion.idSeccion) || {
      puedeVer: false,
      puedeAcceder: false,
    };
    if (!propio.puedeAcceder) return { estado: "none", permiso: propio };
    if (ancestroBloqueado(seccion, permisos, byId)) {
      return { estado: "blocked", permiso: propio };
    }
    return {
      estado: propio.puedeVer ? "full" : "hidden",
      permiso: propio,
    };
  }

  function renderMatriz() {
    if (!state.matrix) return;
    const roles = (state.matrix.roles || []).filter(
      (rol) => !ROLES_NO_CONFIGURABLES.has(rol.codigo)
    );
    const secciones = state.matrix.secciones || [];
    const visibles = construirVisiblesMatriz(roles);

    matrizHead.innerHTML = `
      <tr>
        <th>Sección</th>
        ${roles
          .map(
            (r) => `
          <th>
            <div class="rbac-matrix__role">
              <strong>${escapar(etiquetaRol(r))}${r.esPropio ? " (tú)" : ""}</strong>
              <span>${r.usuariosActivos ?? 0} usuario(s)</span>
            </div>
          </th>`
          )
          .join("")}
      </tr>
    `;

    const filas = [];
    const byId = new Map(secciones.map((s) => [s.idSeccion, s]));
    for (const seccion of secciones) {
      if (!visibles.has(seccion.idSeccion)) continue;
      let nivel = 0;
      let padreId = seccion.idPadre;
      while (padreId && byId.has(padreId) && nivel < 50) {
        nivel += 1;
        padreId = byId.get(padreId).idPadre;
      }

      const celdas = roles
        .map((rol) => {
          const { estado, permiso } = calcularPermisoMatriz(rol, seccion);
          const bloqueada = Boolean(seccion.esProtegida);
          const clase = bloqueada
            ? "locked"
            : estado === "full"
              ? "full"
              : estado === "hidden"
                ? "hidden"
                : estado === "blocked"
                  ? "none"
                  : "none";
          const icono = bloqueada
            ? "bi-lock-fill"
            : estado === "full"
              ? "bi-check-lg"
              : estado === "hidden"
                ? "bi-eye-slash-fill"
                : "bi-dash-lg";
          const titulo = bloqueada
            ? "Sección protegida"
            : estado === "full"
              ? `Visible + acceso (${permiso.puedeVer ? "menú" : "sin menú"})`
              : estado === "hidden"
                ? "Solo acceso, oculto del menú"
                : estado === "blocked"
                  ? "Bloqueado por un ancestro"
                  : "Sin permiso";

          return `<td><button type="button" class="rbac-matrix__cell rbac-matrix__cell--${clase}" data-rol="${rol.idRol}" data-seccion="${seccion.idSeccion}" title="${escapar(titulo)}" aria-label="${escapar(titulo)} · ${escapar(etiquetaRol(rol))} · ${escapar(seccion.nombre)}"><i class="bi ${icono}"></i></button></td>`;
        })
        .join("");

      filas.push(`
        <tr class="${nivel === 0 ? "rbac-row--module" : "rbac-row--child"}">
          <td>
            <div class="rbac-section-name" style="--nivel:${nivel}">
              <span class="rbac-tree-toggle rbac-tree-toggle--placeholder"></span>
              <span class="rbac-section-name__icon"><i class="bi ${escapar(seccion.icono || "bi-folder2")}"></i></span>
              <span class="rbac-section-name__text">
                <span class="rbac-section-name__label">${escapar(seccion.nombre)} ${seccion.esProtegida ? '<i class="bi bi-lock-fill rbac-lock"></i>' : ""}</span>
                <span class="rbac-section-name__code">${escapar(seccion.codigo)}</span>
              </span>
            </div>
          </td>
          ${celdas}
        </tr>
      `);
    }

    matrizBody.innerHTML = filas.join("") || `<tr><td colspan="${roles.length + 1}" class="rbac-loading">Sin resultados.</td></tr>`;

    matrizBody.querySelectorAll("[data-rol]").forEach((boton) => {
      boton.addEventListener("click", async () => {
        const idRol = Number(boton.dataset.rol);
        const rol = roles.find((r) => r.idRol === idRol);
        if (!rol || rol.esPropio) {
          NotificationModal.info("Ese es tu rol actual; no puedes editarlo.");
          return;
        }
        cambiarVista("rol");
        await cargarPermisosRol(idRol);
      });
    });
  }

  async function cargarMatriz() {
    matrizBody.innerHTML = `<tr><td class="rbac-loading"><span class="rbac-spinner"></span> Cargando matriz...</td></tr>`;
    state.matrix = await api("/api/rbac/matriz");
    renderMatriz();
  }

  function cambiarVista(vista) {
    state.view = vista;
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.view === vista);
    });
    vistaRol.hidden = vista !== "rol";
    vistaMatriz.hidden = vista !== "matriz";
    if (vista === "matriz") {
      cargarMatriz().catch((err) => NotificationModal.error(err.message));
    } else {
      renderTabla();
    }
  }

  // ------------------------------------------------------------------------
  // Historial
  // ------------------------------------------------------------------------
  function renderHistorial(items) {
    if (!items?.length) {
      listaHistorial.innerHTML = `<div class="rbac-history-empty"><i class="bi bi-clock"></i><p>No hay cambios registrados para este rol.</p></div>`;
      return;
    }

    const etiquetas = {
      actualizar_permisos: "Permisos actualizados",
      crear_rol: "Rol creado",
      activar_rol: "Rol activado",
      desactivar_rol: "Rol desactivado",
    };

    listaHistorial.innerHTML = items
      .map((item) => {
        const antes = Array.isArray(item.antes) ? item.antes : [];
        const despues = Array.isArray(item.despues) ? item.despues : [];
        const lineas = [];

        for (let i = 0; i < Math.max(antes.length, despues.length); i += 1) {
          const a = antes[i] || {};
          const d = despues[i] || {};
          const codigo = d.codigo || a.codigo || "—";
          lineas.push(
            `${escapar(codigo)} · menú: ${a.ver ? "ON" : "OFF"} → ${d.ver ? "ON" : "OFF"} · acceso: ${a.acceder ? "ON" : "OFF"} → ${d.acceder ? "ON" : "OFF"}`
          );
        }

        return `
          <article class="rbac-history-item">
            <div class="rbac-history-item__top">
              <strong>${escapar(etiquetas[item.accion] || item.accion)}</strong>
              <span>${escapar(formatearFecha(item.creadoEn))}</span>
            </div>
            <div class="rbac-history-item__meta">
              Por ${escapar(item.actor || "Sistema")} · Rol ${escapar(etiquetaRol(item.rolCodigo || item.rol))}
              ${item.motivo ? ` · ${escapar(item.motivo)}` : ""}
            </div>
            ${lineas.length ? `<div class="rbac-history-item__diff">${lineas.map((l) => `<span>${l}</span>`).join("")}</div>` : ""}
          </article>
        `;
      })
      .join("");
  }

  async function abrirHistorial() {
    if (!state.selectedRoleId) return;
    abrirModal("modalHistorial");
    listaHistorial.innerHTML = `<div class="rbac-loading"><span class="rbac-spinner"></span> Cargando historial...</div>`;
    $("subtituloHistorial").textContent = `Últimos cambios de ${etiquetaRol(rolActual())}.`;

    try {
      const items = await api(
        `/api/rbac/auditoria?idRol=${state.selectedRoleId}&limite=50`
      );
      renderHistorial(items);
    } catch (err) {
      listaHistorial.innerHTML = `<div class="rbac-history-empty">${escapar(err.message)}</div>`;
    }
  }

  // ------------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------------
  function conectarEventos() {
    selectRol.addEventListener("change", async () => {
      const id = Number(selectRol.value);
      if (!id) return;
      const ok = await cargarPermisosRol(id);
      if (!ok) selectRol.value = String(state.selectedRoleId);
    });

    $("inputBuscar").addEventListener("input", () => {
      if (state.view === "rol") renderTabla();
      else renderMatriz();
    });

    $("selectFiltro").addEventListener("change", () => {
      if (state.view === "rol") renderTabla();
      else renderMatriz();
    });

    $("btnExpandir").addEventListener("click", () => {
      state.expanded = new Set(state.secciones.map((s) => s.idSeccion));
      renderTabla();
    });

    $("btnContraer").addEventListener("click", () => {
      state.expanded = new Set();
      renderTabla();
    });

    document.querySelectorAll("[data-view]").forEach((boton) => {
      boton.addEventListener("click", () => cambiarVista(boton.dataset.view));
    });

    $("btnGuardar").addEventListener("click", abrirConfirmacionGuardar);
    $("btnDescartar").addEventListener("click", descartarCambios);
    btnConfirmarGuardar.addEventListener("click", guardarCambios);

    chkConfirmarRevocacion.addEventListener("change", () => {
      btnConfirmarGuardar.disabled = !chkConfirmarRevocacion.checked;
    });

    $("btnNuevoRol").addEventListener("click", abrirNuevoRol);
    $("btnNuevoRolEmpty").addEventListener("click", abrirNuevoRol);
    formNuevoRol.addEventListener("submit", crearRol);
    $("btnEstadoRol").addEventListener("click", cambiarEstadoRol);
    $("btnHistorial").addEventListener("click", abrirHistorial);

    document.querySelectorAll("[data-close]").forEach((elemento) => {
      elemento.addEventListener("click", () => {
        const mapa = {
          guardar: "modalGuardar",
          nuevo: "modalNuevoRol",
          historial: "modalHistorial",
        };
        cerrarModal(mapa[elemento.dataset.close]);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      for (const id of ["modalGuardar", "modalNuevoRol", "modalHistorial"]) {
        const modal = $(id);
        if (modal && !modal.hidden) {
          cerrarModal(id);
          return;
        }
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  // ------------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------------
  async function iniciar() {
    if (!(await initializeProtectedPage())) return;
    conectarEventos();

    // El hash #permisos se usa para activar la sección en LayoutManager, pero
    // el navegador intenta desplazarse hasta ella y puede ocultar el título
    // bajo el topbar. En esta página de una sola sección basta con ir arriba.
    window.scrollTo(0, 0);

    try {
      await cargarRoles();
    } catch (err) {
      if (err.status === 403) {
        window.location.replace("../pages/403.html?seccion=configuracion.permisos");
        return;
      }
      NotificationModal.error(err.data?.mensaje || err.message);
    }
  }

  iniciar();
})();
