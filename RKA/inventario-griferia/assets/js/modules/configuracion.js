import { AppCore } from "../core/app-core.js";
import { initializeProtectedPage } from "../core/page-bootstrap.js";
import { AuthService } from "../auth/auth-core.js";
import { Validations } from "../core/validations.js";
import { NotificationModal } from "../core/notifications.js";

(async function initConfiguracionModule() {
  if (!(await initializeProtectedPage())) return;
  const authService = new AuthService();

  let appData = AppCore.loadAppData();
  AppCore.loadSampleDataIfEmpty(appData);

  const btnGuardarCambios = document.getElementById("btnGuardarCambios");
  const usuariosTableBody = document.getElementById("usuariosTableBody");
  const btnNuevoUsuario = document.getElementById("btnNuevoUsuario");
  const modalUsuario = document.getElementById("modalUsuario");
  const modalUsuarioCerrar = document.getElementById("modalUsuarioCerrar");
  const btnCancelarUsuario = document.getElementById("btnCancelarUsuario");
  const formUsuario = document.getElementById("formUsuario");
  const selectTipoDocumento = document.getElementById("selectTipoDocumento");
  const inputNumDocumento = document.getElementById("inputNumDocumento");
  const inputNombres = document.getElementById("inputNombres");
  const inputApellidos = document.getElementById("inputApellidos");
  const inputNacionalidad = document.getElementById("inputNacionalidad");
  const inputEmailUsuario = document.getElementById("inputEmailUsuario");
  const grupoPreguntaSeguridad = document.getElementById("grupoPreguntaSeguridad");
  const grupoRespuestaSeguridad = document.getElementById("grupoRespuestaSeguridad");
  const inputPreguntaSeguridad = document.getElementById("inputPreguntaSeguridad");
  const inputRespuestaSeguridad = document.getElementById("inputRespuestaSeguridad");
  const inputPasswordGenerada = document.getElementById("inputPasswordGenerada");
  const btnCopiarPassword = document.getElementById("btnCopiarPassword");

  // Longitudes máximas por tipo de documento
  const DOC_LIMITES = { dni: 8, ce: 9, ruc: 11 };

  // API de DNI / Carnet de Extranjería (api.apis.net.pe)
  // Crea tu token gratis en https://apis.net.pe y reemplázalo aquí:
  const API_TOKEN_DEFAULT = "";

  let modoEdicion = false;
  let indiceEdicion = -1;

  function openUsuarioModal(indice = -1) {
    modoEdicion = indice >= 0;
    indiceEdicion = indice;
    formUsuario?.reset();
    document
      .querySelectorAll('#selectRolUsuario option[data-rol-temporal="1"]')
      .forEach((opcion) => opcion.remove());

    const modalTitle = document.getElementById("modalUsuarioTitulo");
    const submitText = formUsuario?.querySelector('button[type="submit"] .btn-text');

    if (modoEdicion) {
      const u = USUARIOS_EJEMPLO[indice];
      if (!u) return;
      if (selectTipoDocumento) selectTipoDocumento.value = u.tipoDocumento || "dni";
      if (inputNumDocumento) inputNumDocumento.value = u.numDocumento || "";
      if (inputNombres) inputNombres.value = u.nombres || "";
      if (inputApellidos) inputApellidos.value = u.apellidos || "";
      if (inputNacionalidad) inputNacionalidad.value = u.nacionalidad || "";
      // La pregunta y respuesta de seguridad solo se configuran al crear.
      grupoPreguntaSeguridad?.classList.add("d-none");
      grupoRespuestaSeguridad?.classList.add("d-none");
      if (inputPreguntaSeguridad) {
        inputPreguntaSeguridad.value = "";
        inputPreguntaSeguridad.required = false;
      }
      if (inputRespuestaSeguridad) {
        inputRespuestaSeguridad.value = "";
        inputRespuestaSeguridad.required = false;
      }
      const selectRol = document.getElementById("selectRolUsuario");
      if (selectRol && u.rol) {
        const existe = Array.from(selectRol.options).some(
          (opcion) => opcion.value === u.rol
        );
        if (!existe) {
          const opcion = document.createElement("option");
          opcion.value = u.rol;
          opcion.textContent = u.rol;
          opcion.dataset.rolTemporal = "1";
          selectRol.appendChild(opcion);
        }
        selectRol.value = u.rol;
      }
      if (inputEmailUsuario) inputEmailUsuario.value = u.email || "";
      if (inputPasswordGenerada) inputPasswordGenerada.value = u.contrasena || "";
      actualizarCredenciales();
      if (modalTitle) modalTitle.textContent = "Editar Usuario";
      if (submitText) submitText.textContent = "Guardar Cambios";
    } else {
      grupoPreguntaSeguridad?.classList.remove("d-none");
      grupoRespuestaSeguridad?.classList.remove("d-none");
      if (inputPreguntaSeguridad) {
        inputPreguntaSeguridad.value = "";
        inputPreguntaSeguridad.required = true;
      }
      if (inputRespuestaSeguridad) {
        inputRespuestaSeguridad.value = "";
        inputRespuestaSeguridad.required = true;
      }
      actualizarCredenciales();
      if (modalTitle) modalTitle.textContent = "Nuevo Usuario";
      if (submitText) submitText.textContent = "Crear Usuario";
    }

    modalUsuario?.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
    setTimeout(() => inputNombres?.focus(), 100);
  }

  function closeUsuarioModal() {
    modalUsuario?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
  }

  function generarUsuario(nombres, apellidos) {
    const base = `${nombres}.${apellidos}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9.]/g, "");
    return base || "usuario";
  }

  // Normaliza tildes/ñ -> ascii
  function normalizar(texto) {
    return (texto || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  // Primer token (palabra) de un texto
  function primeraPalabra(texto) {
    return normalizar(texto).split(/\s+/)[0] || "";
  }

  // Correo: inicial del primer nombre + primer apellido + @rka.com
  // Ejemplo: Nombre Apellido -> n.apellido@rka.com
  function generarCorreo(nombres, apellidos) {
    const inicial = primeraPalabra(nombres).charAt(0);
    const primerApellido = primeraPalabra(apellidos);
    if (!inicial || !primerApellido) return "";
    return `${inicial}.${primerApellido}@rka.com`;
  }

  // Contraseña: primerapellido.primernombre_año (minúsculas)
  // La contraseña temporal combina apellido, nombre y año.
  function generarContrasenaAuto(nombres, apellidos) {
    const primerApellido = primeraPalabra(apellidos);
    const primerNombre = primeraPalabra(nombres);
    if (!primerApellido || !primerNombre) return "";
    const anio = new Date().getFullYear();
    return `${primerApellido}.${primerNombre}_${anio}`;
  }

  // Inicial del primer nombre + primer apellido.
  function nombreCorto(nombres, apellidos) {
    const inicial = primeraPalabra(nombres).charAt(0).toUpperCase();
    const apellidosLimpios = (apellidos || "").trim().replace(/\s+/g, " ");
    if (!inicial || !apellidosLimpios) return `${nombres} ${apellidos}`.trim();
    return `${inicial}. ${apellidosLimpios}`;
  }

  // Generación en tiempo real del correo y la contraseña
  function actualizarCredenciales() {
    const nombres = inputNombres?.value || "";
    const apellidos = inputApellidos?.value || "";
    const correo = generarCorreo(nombres, apellidos);
    const password = generarContrasenaAuto(nombres, apellidos);

    // Al editar se conservan el correo y la contraseña actuales.
    if (inputEmailUsuario && !modoEdicion) inputEmailUsuario.value = correo;
    if (inputPasswordGenerada && !modoEdicion) {
      inputPasswordGenerada.value = password;
    }
  }

  async function consultarApiDocumento(tipo, numero, token) {
    const baseUrl = tipo === "dni"
      ? `https://api.apis.net.pe/v1/dni?numero=${encodeURIComponent(numero)}`
      : `https://api.apis.net.pe/v1/ce?numero=${encodeURIComponent(numero)}`;

    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const resp = await fetch(baseUrl, { headers });
    if (!resp.ok) throw new Error(`Error ${resp.status}`);
    const data = await resp.json();

    // Normalizar respuesta de la API
    const nombres = data.nombres || data.nombre || "";
    const apellidos = [data.apellidoPaterno, data.apellidoMaterno].filter(Boolean).join(" ") || data.apellidos || "";
    const nacionalidad = data.nacionalidad || (tipo === "dni" ? "Peruana" : "Extranjero");

    return { nombres, apellidos, nacionalidad };
  }

  inputNumDocumento?.addEventListener("input", async () => {
    const tipo = selectTipoDocumento?.value;
    const maxLen = DOC_LIMITES[tipo] || 8;
    let num = inputNumDocumento.value.replace(/\D/g, "");
    if (num.length > maxLen) num = num.slice(0, maxLen);
    inputNumDocumento.value = num;
    const token = API_TOKEN_DEFAULT;

    if (tipo === "dni" && num.length === 8 && token) {
      try {
        const d = await consultarApiDocumento("dni", num, token);
        inputNombres.value = d.nombres;
        inputApellidos.value = d.apellidos;
        inputNacionalidad.value = d.nacionalidad;
        actualizarCredenciales();
        return;
      } catch (err) {
        console.warn("API DNI no disponible:", err.message);
      }
    }

    if (tipo === "ce" && num.length >= 7 && token) {
      try {
        const d = await consultarApiDocumento("ce", num, token);
        inputNombres.value = d.nombres;
        inputApellidos.value = d.apellidos;
        inputNacionalidad.value = d.nacionalidad;
        actualizarCredenciales();
        return;
      } catch (err) {
        console.warn("API Carnet no disponible:", err.message);
      }
    }

  });

  selectTipoDocumento?.addEventListener("change", () => {
    const tipo = selectTipoDocumento.value;
    const maxLen = DOC_LIMITES[tipo] || 8;
    inputNumDocumento.maxLength = maxLen;
    inputNumDocumento.value = inputNumDocumento.value.replace(/\D/g, "").slice(0, maxLen);
    const placeholders = {
      dni: "8 dígitos",
      ce: "9 dígitos",
      ruc: "11 dígitos",
    };
    inputNumDocumento.placeholder = placeholders[tipo] || "Número de documento";
  });

  // Generación en tiempo real al escribir nombres / apellidos
  inputNombres?.addEventListener("input", actualizarCredenciales);
  inputApellidos?.addEventListener("input", actualizarCredenciales);

  // Copiar contraseña generada
  btnCopiarPassword?.addEventListener("click", () => {
    const valor = inputPasswordGenerada?.value;
    if (!valor) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(valor).then(() => {
        btnCopiarPassword.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(() => {
          btnCopiarPassword.innerHTML = '<i class="bi bi-clipboard"></i>';
        }, 1500);
      });
    }
  });

  // ---------------------------------------------------------------
  // Sincronización con PostgreSQL  ->  API /api/usuarios
  // ---------------------------------------------------------------
  const API_USUARIOS = "/api/usuarios";

  /** Fila de la API -> modelo que consume la tabla / la card de detalle. */
  function modeloDesdeApi(u) {
    return {
      id: u.id,
      nombre: nombreCorto(u.nombres, u.apellidos),
      nombres: u.nombres || "",
      apellidos: u.apellidos || "",
      email: u.email || "",
      rol: u.rol || "",
      estado: u.estado || "Activo",
      tipoDocumento: u.tipoDocumento || "dni",
      numDocumento: u.numDocumento || "",
      nacionalidad: u.nacionalidad || "Peruana",
      usuario: u.usuario || "",
      preguntaSeguridad: u.preguntaSeguridad || "",
      contrasena: u.contrasena || "",
      creadoEn: u.creadoEn || "",
      ultimoAcceso: u.ultimoAcceso
        ? AppCore.formatDateTime(u.ultimoAcceso)
        : "Nunca ha iniciado sesión",
    };
  }

  /** Modelo del formulario -> cuerpo JSON de la API. */
  function payloadUsuario(d) {
    const payload = {
      nombres: d.nombres,
      apellidos: d.apellidos,
      tipoDocumento: d.tipoDocumento,
      numDocumento: d.numDocumento,
      nacionalidad: d.nacionalidad,
      email: d.email,
      usuario: d.usuario,
      contrasena: d.contrasena,
      rol: d.rol,
      estado: d.estado || "Activo",
    };
    // Solo se envían si se está definiendo/cambiando la pregunta de seguridad.
    if (d.preguntaSeguridad && d.respuestaSeguridad) {
      payload.preguntaSeguridad = d.preguntaSeguridad;
      payload.respuestaSeguridad = d.respuestaSeguridad;
    }
    return payload;
  }

  async function apiUsuarios(url, opciones = {}) {
    const resp = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...opciones,
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || `Error ${resp.status}`);
    return body;
  }

  /** Copia los usuarios de la BD a la caché local de AuthService (respaldo). */
  function sincronizarCachetLocal(lista) {
    const users = authService.getUsers();
    lista.forEach((u) => {
      const idx = users.findIndex(
        (x) =>
          (x.correo || "").toLowerCase() === (u.email || "").toLowerCase() ||
          x.usuario === u.usuario ||
          String(x.id) === String(u.id)
      );
      const previo = idx >= 0 ? users[idx] : null;
      const registro = {
        id: u.id != null ? String(u.id) : AppCore.generateId(),
        usuario: u.usuario,
        nombre: `${u.nombres} ${u.apellidos}`.trim(),
        correo: u.email,
        contrasena: u.contrasena || previo?.contrasena || "",
        rol: u.rol,
        tipoDocumento: u.tipoDocumento,
        numDocumento: u.numDocumento,
        nacionalidad: u.nacionalidad,
        preguntaSeguridad: u.preguntaSeguridad || "",
        _api: u.id != null,
        actualizadoEn: new Date().toISOString(),
      };
      if (idx >= 0) users[idx] = { ...users[idx], ...registro };
      else users.push(registro);
    });
    authService.saveUsers(users);
  }

  /** Carga la tabla directamente desde PostgreSQL. */
  async function cargarUsuariosDesdeApi() {
    try {
      const rows = await apiUsuarios(API_USUARIOS);
      if (!Array.isArray(rows) || !rows.length) return false;
      const lista = rows.map(modeloDesdeApi);
      USUARIOS_EJEMPLO.length = 0;
      lista.forEach((u) => USUARIOS_EJEMPLO.push(u));
      renderUsuarios();
      sincronizarCachetLocal(lista);
      authService.depurarUsuariosApi(rows); // quita de la caché local a los dados de baja
      return true;
    } catch (err) {
      console.warn("No se pudieron leer los usuarios de PostgreSQL:", err.message);
      return false;
    }
  }

  formUsuario?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(formUsuario);
    const nombres = (formData.get("nombres") || "").trim();
    const apellidos = (formData.get("apellidos") || "").trim();
    const nacionalidad = (formData.get("nacionalidad") || "").trim();
    const rol = formData.get("rol");
    const email = (formData.get("email") || "").trim();
    const numDocumento = (formData.get("numDocumento") || "").trim();
    const preguntaSeguridad = (formData.get("preguntaSeguridad") || "").trim();
    const respuestaSeguridad = (formData.get("respuestaSeguridad") || "").trim();

    if (!modoEdicion) {
      if (!preguntaSeguridad || !respuestaSeguridad) {
        alert("La pregunta y la respuesta de seguridad son obligatorias.");
        return;
      }
    } else if (respuestaSeguridad && !preguntaSeguridad) {
      alert("Indica la pregunta de seguridad junto con la respuesta.");
      return;
    } else if (!respuestaSeguridad && indiceEdicion >= 0) {
      const preguntaActual = (USUARIOS_EJEMPLO[indiceEdicion].preguntaSeguridad || "").trim();
      if (preguntaSeguridad && preguntaSeguridad !== preguntaActual) {
        alert("Para cambiar la pregunta de seguridad debes escribir una nueva respuesta.");
        return;
      }
    }

    const numError = Validations.firstError([
      [Validations.required(nombres, 3), "Los nombres son obligatorios (mínimo 3 caracteres)."],
      [Validations.required(apellidos, 3), "Los apellidos son obligatorios (mínimo 3 caracteres)."],
      [Validations.required(numDocumento, 1), "El número de documento es obligatorio."],
      [
        formData.get("tipoDocumento") === "dni"
          ? Validations.isDNI(numDocumento)
          : formData.get("tipoDocumento") === "ce"
          ? Validations.isCarnetExtranjeria(numDocumento)
          : /^\d{11}$/.test(numDocumento),
        formData.get("tipoDocumento") === "dni"
          ? "El DNI debe tener exactamente 8 dígitos numéricos."
          : formData.get("tipoDocumento") === "ce"
          ? "El Carnet de Extranjería debe tener exactamente 9 dígitos numéricos."
          : "El RUC debe tener exactamente 11 dígitos numéricos.",
      ],
    ]);
    if (numError) {
      alert(numError);
      return;
    }

    const usuario = generarUsuario(nombres, apellidos);
    const contrasenaGenerada = generarContrasenaAuto(nombres, apellidos);
    const contrasena =
      modoEdicion && indiceEdicion >= 0
        ? USUARIOS_EJEMPLO[indiceEdicion]?.contrasena ||
          inputPasswordGenerada?.value ||
          contrasenaGenerada
        : contrasenaGenerada;
    const correoGenerado = generarCorreo(nombres, apellidos);
    const correoFinal =
      modoEdicion && indiceEdicion >= 0
        ? USUARIOS_EJEMPLO[indiceEdicion]?.email ||
          inputEmailUsuario?.value ||
          correoGenerado ||
          `${usuario}@rka.com`
        : correoGenerado || `${usuario}@rka.com`;

    // ---------------- MODO EDICIÓN ----------------
    if (modoEdicion && indiceEdicion >= 0) {
      const previo = USUARIOS_EJEMPLO[indiceEdicion];
      const users = authService.getUsers();

      // El usuario de acceso se conserva al editar; solo se genera si faltaba.
      const usernameBase = generarUsuario(nombres, apellidos);
      let usuarioFinal = previo.usuario || usernameBase;
      if (!previo.usuario) {
        let i = 1;
        while (users.some((u) => u.usuario === usuarioFinal)) {
          usuarioFinal = `${usernameBase}${i}`;
          i++;
        }
      }

      USUARIOS_EJEMPLO[indiceEdicion] = {
        ...previo,
        nombre: nombreCorto(nombres, apellidos),
        nombres,
        apellidos,
        email: correoFinal,
        rol,
        tipoDocumento: formData.get("tipoDocumento"),
        numDocumento,
        nacionalidad,
        usuario: usuarioFinal,
        preguntaSeguridad: respuestaSeguridad ? preguntaSeguridad : previo.preguntaSeguridad || "",
        contrasena: previo.contrasena || contrasena,
      };

      // Actualizar también el registro en AuthService si existe
      const idx = users.findIndex((u) => u.usuario === previo.usuario);
      if (idx >= 0) {
        users[idx] = {
          ...users[idx],
          usuario: usuarioFinal,
          nombre: `${nombres} ${apellidos}`,
          correo: correoFinal,
          rol,
          tipoDocumento: formData.get("tipoDocumento"),
          numDocumento,
          nacionalidad,
          preguntaSeguridad: respuestaSeguridad
            ? preguntaSeguridad
            : users[idx].preguntaSeguridad || "",
          actualizadoEn: new Date().toISOString(),
        };
        authService.saveUsers(users);
      }

      // Persistir en PostgreSQL
      let guardadoBd = false;
      if (previo.id != null) {
        try {
          await apiUsuarios(`${API_USUARIOS}/${previo.id}`, {
            method: "PUT",
            body: JSON.stringify(
              payloadUsuario({
                ...USUARIOS_EJEMPLO[indiceEdicion],
                preguntaSeguridad,
                respuestaSeguridad,
              })
            ),
          });
          guardadoBd = true;
        } catch (err) {
          console.warn("No se pudo actualizar en PostgreSQL:", err.message);
        }
      }
      // Mantener la caché local de inicio de sesión al día
      sincronizarCachetLocal([USUARIOS_EJEMPLO[indiceEdicion]]);

      renderUsuarios();
      // Refrescar la card de detalle si está abierta sobre este usuario
      if (modalDetalle?.classList.contains("is-open")) {
        abrirDetalleUsuario(USUARIOS_EJEMPLO[indiceEdicion], indiceEdicion);
      }
      closeUsuarioModal();
      alert(`Usuario actualizado correctamente.${guardadoBd ? "\nBase de datos: PostgreSQL (usuarios)." : ""}\n\nColaborador: ${USUARIOS_EJEMPLO[indiceEdicion].nombre}\nRol: ${rol}`);
      return;
    }

    // ---------------- MODO CREACIÓN ----------------
    const users = authService.getUsers();
    // Evitar usuario duplicado
    let usuarioFinal = usuario;
    let i = 1;
    while (users.some((u) => u.usuario === usuarioFinal)) {
      usuarioFinal = `${usuario}${i}`;
      i++;
    }

    users.push({
      id: AppCore.generateId(),
      usuario: usuarioFinal,
      nombre: `${nombres} ${apellidos}`,
      correo: correoFinal,
      contrasena,
      preguntaSeguridad,
      rol,
      tipoDocumento: formData.get("tipoDocumento"),
      numDocumento,
      nacionalidad,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    });
    authService.saveUsers(users);

    // Refrescar la tabla de usuarios mostrada (y persistir en PostgreSQL)
    const nuevoRegistro = {
      id: null,
      nombre: nombreCorto(nombres, apellidos),
      nombres,
      apellidos,
      email: correoFinal,
      rol,
      estado: "Activo",
      tipoDocumento: formData.get("tipoDocumento"),
      numDocumento,
      nacionalidad,
      usuario: usuarioFinal,
      preguntaSeguridad,
      contrasena,
      creadoEn: new Date().toISOString(),
      ultimoAcceso: "Nunca ha iniciado sesión",
    };

    let guardadoBd = false;
    try {
      const creado = await apiUsuarios(API_USUARIOS, {
        method: "POST",
        body: JSON.stringify(
          payloadUsuario({ ...nuevoRegistro, preguntaSeguridad, respuestaSeguridad })
        ),
      });
      nuevoRegistro.id = creado.id;
      if (creado.creadoEn) nuevoRegistro.creadoEn = creado.creadoEn;
      guardadoBd = true;
    } catch (err) {
      console.warn("No se pudo crear el usuario en PostgreSQL:", err.message);
    }

    USUARIOS_EJEMPLO.push(nuevoRegistro);
    sincronizarCachetLocal([nuevoRegistro]);
    renderUsuarios();

    closeUsuarioModal();
    alert(
      `Usuario creado correctamente.${guardadoBd ? "\nBase de datos: PostgreSQL (usuarios)." : ""}\n\nColaborador: ${nombreCorto(nombres, apellidos)}\nCorreo institucional: ${correoFinal}\nContraseña provisional: ${contrasena}`
    );
  });

  const USUARIOS_EJEMPLO = [];

  // ---------------------------------------------------------------
  // Modal de detalle del usuario (card centrada)
  // ---------------------------------------------------------------
  const modalDetalle = document.getElementById("modalDetalleUsuario");
  const modalDetalleCerrar = document.getElementById("modalDetalleCerrar");
  const btnCopiarCredenciales = document.getElementById("btnCopiarCredenciales");
  let usuarioDetalleActual = null;
  let indiceDetalle = -1;

  const DOC_LABELS = { dni: "DNI", ce: "CE", ruc: "RUC" };

  function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor || "—";
  }

  function abrirDetalleUsuario(usuario, indice = -1) {
    if (!modalDetalle || !usuario) return;
    usuarioDetalleActual = usuario;
    indiceDetalle = indice;

    const iniciales = (usuario.nombre || "?").replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");

    setText("detalleAvatar", iniciales || "?");
    setText("detalleNombre", usuario.nombre);
    setText("detalleEmail", usuario.email);
    setText("detalleTipoDoc", DOC_LABELS[usuario.tipoDocumento] || "DNI");
    setText("detalleNumDoc", usuario.numDocumento);
    setText("detalleNombres", usuario.nombres);
    setText("detalleApellidos", usuario.apellidos);
    setText("detalleNacionalidad", usuario.nacionalidad);
    setText("detalleRol", usuario.rol);
    setText("detalleUsuario", usuario.usuario);
    setText("detallePassword", usuario.contrasena);
    setText("detalleCorreo", usuario.email);
    setText("detalleFecha", usuario.creadoEn ? AppCore.formatDate(usuario.creadoEn) : "—");
    setText("detalleUltimoAcceso", usuario.ultimoAcceso || "Sin registros");

    const badge = document.getElementById("detalleEstado");
    if (badge) {
      const activo = (usuario.estado || "Activo") === "Activo";
      badge.textContent = usuario.estado || "Activo";
      badge.className = `badge ${activo ? "badge--success" : "badge--danger"}`;
    }

    modalDetalle.classList.add("is-open");
    document.body.classList.add("overflow-hidden");
  }

  function cerrarDetalleUsuario() {
    modalDetalle?.classList.remove("is-open");
    document.body.classList.remove("overflow-hidden");
    usuarioDetalleActual = null;
    indiceDetalle = -1;
  }

  modalDetalleCerrar?.addEventListener("click", cerrarDetalleUsuario);

  modalDetalle?.addEventListener("click", (e) => {
    if (e.target === modalDetalle) cerrarDetalleUsuario();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalDetalle?.classList.contains("is-open")) {
      cerrarDetalleUsuario();
    }
  });

  // ---------------- EDITAR ----------------
  const btnEditarUsuario = document.getElementById("btnEditarUsuario");

  btnEditarUsuario?.addEventListener("click", () => {
    if (indiceDetalle < 0) return;
    const indice = indiceDetalle;
    cerrarDetalleUsuario();
    openUsuarioModal(indice);
  });

  // ---------------- ELIMINAR ----------------
  const btnEliminarUsuario = document.getElementById("btnEliminarUsuario");

  async function eliminarUsuarioActual() {
    if (indiceDetalle < 0) return;
    const u = USUARIOS_EJEMPLO[indiceDetalle];
    if (!u) return;

    const confirmar = await NotificationModal.confirm(
      `¿Eliminar al colaborador?\n\n${u.nombre}\n${u.email}\n\nEsta acción no se puede deshacer.`,
      { titulo: "Eliminar colaborador", textoAceptar: "Eliminar" }
    );
    if (!confirmar) return;

    let eliminadoBd = false;
    if (u.id != null) {
      try {
        await apiUsuarios(`${API_USUARIOS}/${u.id}`, { method: "DELETE" });
        eliminadoBd = true;
      } catch (err) {
        const continuar = await NotificationModal.confirm(
          `No se pudo eliminar el registro de PostgreSQL:\n${err.message}\n\n¿Eliminarlo igual de la lista local?`,
          { titulo: "Atención", textoAceptar: "Eliminar igual" }
        );
        if (!continuar) return;
      }
    }

    USUARIOS_EJEMPLO.splice(indiceDetalle, 1);

    // Quitar también del AuthService
    const users = authService.getUsers();
    const idx = users.findIndex(
      (x) => x.usuario === u.usuario || x.correo === u.email
    );
    if (idx >= 0) {
      users.splice(idx, 1);
      authService.saveUsers(users);
    }

    renderUsuarios();
    cerrarDetalleUsuario();
    alert(
      `Colaborador eliminado.${eliminadoBd ? "\nBase de datos: PostgreSQL (usuarios)." : ""}\n\n${u.nombre}`
    );
  }

  btnEliminarUsuario?.addEventListener("click", eliminarUsuarioActual);

  btnCopiarCredenciales?.addEventListener("click", () => {
    if (!usuarioDetalleActual) return;
    const texto =
      `Colaborador: ${usuarioDetalleActual.nombre}\n` +
      `Correo: ${usuarioDetalleActual.email}\n` +
      `Usuario: ${usuarioDetalleActual.usuario}\n` +
      (usuarioDetalleActual.contrasena
        ? `Contraseña: ${usuarioDetalleActual.contrasena}\n`
        : "") +
      `Rol: ${usuarioDetalleActual.rol}`;
    navigator.clipboard?.writeText(texto).then(() => {
      btnCopiarCredenciales.innerHTML = '<i class="bi bi-check2"></i> Copiado';
      setTimeout(() => {
        btnCopiarCredenciales.innerHTML = '<i class="bi bi-clipboard-check"></i> Copiar Credenciales';
      }, 1500);
    });
  });

  function renderUsuarios() {
    if (!usuariosTableBody) return;
    usuariosTableBody.innerHTML = USUARIOS_EJEMPLO.map(
      (u, i) => `
      <tr class="usuario-row" data-index="${i}" tabindex="0" role="button" aria-label="Ver detalle de ${u.nombre}">
        <td><strong>${u.nombre}</strong><br /><small class="text-muted">${u.email}</small></td>
        <td>${u.rol}</td>
        <td><span class="badge ${u.estado === "Activo" ? "badge--success" : "badge--danger"}">${u.estado}</span></td>
      </tr>`
    ).join("");
  }

  // Clic o Enter en una fila abre el detalle
  usuariosTableBody?.addEventListener("click", (e) => {
    const fila = e.target.closest(".usuario-row");
    if (!fila) return;
    const i = Number(fila.dataset.index);
    abrirDetalleUsuario(USUARIOS_EJEMPLO[i], i);
  });

  usuariosTableBody?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const fila = e.target.closest(".usuario-row");
    if (!fila) return;
    e.preventDefault();
    const i = Number(fila.dataset.index);
    abrirDetalleUsuario(USUARIOS_EJEMPLO[i], i);
  });

  function loadConfig() {
    const config = appData.configuracion || {};
    document.getElementById("inputNombreEmpresa").value = config.nombreEmpresa || "";
    document.getElementById("inputRuc").value = config.ruc || "";
    document.getElementById("inputDireccionEmpresa").value = config.direccion || "";
    document.getElementById("inputTelefonoEmpresa").value = config.telefono || "";
  }

  async function guardarUsuariosEnBd() {
    const usuariosBd = USUARIOS_EJEMPLO.filter((u) => u.id != null);
    let guardados = 0;
    for (const u of usuariosBd) {
      try {
        await apiUsuarios(`${API_USUARIOS}/${u.id}`, {
          method: "PUT",
          body: JSON.stringify(payloadUsuario(u)),
        });
        guardados += 1;
      } catch (err) {
        console.warn(`No se pudo guardar el usuario ${u.usuario}:`, err.message);
      }
    }
    return { guardados, total: usuariosBd.length };
  }

  btnGuardarCambios?.addEventListener("click", async () => {
    const cfgError = Validations.firstError([
      [Validations.required(document.getElementById("inputNombreEmpresa").value.trim(), 3), "La Razón Social es obligatoria (mínimo 3 caracteres)."],
      [!document.getElementById("inputRuc").value.trim() || /^[0-9.\-]{9,13}$/.test(document.getElementById("inputRuc").value.trim()), "El NIT / Identificación debe tener entre 9 y 13 dígitos."],
      [Validations.isNonNegativeInt(parseFloat(document.getElementById("inputIva").value) ) || Validations.required(document.getElementById("inputIva").value), "El impuesto IVA debe ser un número válido."],
      [Validations.isNonNegativeInt(parseInt(document.getElementById("inputStockMinimoGlobal").value)) || parseInt(document.getElementById("inputStockMinimoGlobal").value) >= 0, "El stock mínimo debe ser un número mayor o igual a 0."],
    ]);
    if (cfgError) {
      alert(cfgError);
      return;
    }

    appData.configuracion = {
      nombreEmpresa: document.getElementById("inputNombreEmpresa").value.trim(),
      ruc: document.getElementById("inputRuc").value.trim(),
      direccion: document.getElementById("inputDireccionEmpresa").value.trim(),
      telefono: document.getElementById("inputTelefonoEmpresa").value.trim(),
      email: appData.configuracion?.email || "",
      ciudad: appData.configuracion?.ciudad || "",
      web: appData.configuracion?.web || "",
      monedaBase: document.getElementById("inputMonedaBase").value.trim(),
      iva: document.getElementById("inputIva").value.trim(),
      stockMinimoGlobal: document.getElementById("inputStockMinimoGlobal").value.trim(),
      formatoSku: document.getElementById("inputFormatoSku").value.trim(),
    };
    try {
      await AppCore.saveAppData(appData);
      const { guardados, total } = await guardarUsuariosEnBd();
      await cargarUsuariosDesdeApi();
      alert(
        `Configuración guardada correctamente.\nUsuarios sincronizados en PostgreSQL: ${guardados} de ${total}.`
      );
    } catch (err) {
      alert(`No se pudieron guardar todos los cambios:\n${err.message}`);
    }
  });

  btnNuevoUsuario?.addEventListener("click", openUsuarioModal);
  modalUsuarioCerrar?.addEventListener("click", closeUsuarioModal);
  btnCancelarUsuario?.addEventListener("click", closeUsuarioModal);

  renderUsuarios();
  cargarUsuariosDesdeApi(); // la tabla se refresca con los datos de PostgreSQL
  loadConfig();
})();
