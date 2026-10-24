import { StorageService } from "../core/storage-service.js";

/**
 * AuthService
 * Gestiona autenticación, usuarios, sesiones y recuperación de contraseña
 */
export class AuthService {
  static STORAGE_KEYS = {
    USERS: "users",
    CURRENT_USER: "currentUser",
    SESSION: "session",
    REMEMBER_ME: "rememberMe",
    PASSWORD_RECOVERY: "passwordRecovery",
  };

  static SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  static REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  _generateId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
    );
  }

  getUsers() {
    const users = StorageService.getItem(AuthService.STORAGE_KEYS.USERS, []);
    // La respuesta de seguridad ya no se guarda en el navegador; elimina
    // cualquier valor heredado de versiones anteriores.
    let cambio = false;
    if (Array.isArray(users)) {
      users.forEach((user) => {
        if (
          user &&
          Object.prototype.hasOwnProperty.call(user, "respuestaSeguridad")
        ) {
          delete user.respuestaSeguridad;
          cambio = true;
        }
      });
    }
    if (cambio) this.saveUsers(users);
    return users;
  }

  saveUsers(users) {
    if (!Array.isArray(users)) return;
    StorageService.setItem(AuthService.STORAGE_KEYS.USERS, users);
  }

  findUserByIdentifier(identificador) {
    if (!identificador) return null;
    const normalized = identificador.trim().toLowerCase();
    return (
      this.getUsers().find(
        (user) =>
          user.usuario?.toLowerCase() === normalized ||
          user.correo?.toLowerCase() === normalized,
      ) || null
    );
  }

  login(identificador, contrasena, recordar = false) {
    const user = this.findUserByIdentifier(identificador);
    if (!user) {
      return { success: false, message: "Usuario o contraseña incorrectos." };
    }
    if (user.contrasena !== contrasena) {
      return { success: false, message: "Usuario o contraseña incorrectos." };
    }

    const now = Date.now();
    const session = {
      userId: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol || "usuario",
      loginAt: now,
      expiresAt: now + AuthService.SESSION_TTL_MS,
    };

    const currentUserSafe = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol || "usuario",
      preguntaSeguridad: user.preguntaSeguridad || "",
    };

    StorageService.setItem(
      AuthService.STORAGE_KEYS.CURRENT_USER,
      currentUserSafe,
    );
    StorageService.setItem(AuthService.STORAGE_KEYS.SESSION, session);
    StorageService.setItem(
      AuthService.STORAGE_KEYS.REMEMBER_ME,
      Boolean(recordar),
    );

    return {
      success: true,
      message: "Inicio de sesión exitoso",
      user: currentUserSafe,
    };
  }

  /**
   * loginConApi
   * Autentica contra PostgreSQL (POST /api/usuarios/login) usando el correo
   * institucional o el usuario, más la contraseña provisional.
   * - 200 -> sincroniza el usuario en la caché local y crea la sesión.
   * - 401/403 -> devuelve el mensaje de error del servidor.
   * - Sin conexión -> valida contra la caché local (modo respaldo).
   */
  async loginConApi(identificador, contrasena, recordar = false) {
    try {
      const resp = await fetch("/api/usuarios/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificador, contrasena, recordar }),
      });

      if (resp.ok) {
        const apiUser = await resp.json();
        this._syncUsuarioLocal(apiUser);
        this._crearSesionDesdeApi(apiUser, recordar);
        return {
          success: true,
          message: "Inicio de sesión exitoso",
          user: this.getCurrentUser(),
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        let message = "Correo o contraseña incorrectos.";
        try {
          const body = await resp.json();
          if (body && (body.mensaje || body.error))
            message = body.mensaje || body.error;
        } catch (_e) {
          /* respuesta sin cuerpo JSON */
        }
        return { success: false, message };
      }

      let message = "No se pudo iniciar sesión. Intenta nuevamente.";
      try {
        const body = await resp.json();
        if (body && (body.mensaje || body.error))
          message = body.mensaje || body.error;
      } catch (_e) {
        /* respuesta sin cuerpo JSON */
      }
      return { success: false, message };
    } catch (_e) {
      // Sin servidor no hay cookie de sesión: no se permite un login local
      // que la guarda del servidor rechazaría en la siguiente navegación.
      return {
        success: false,
        message:
          "No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.",
      };
    }
  }

  /**
   * cargarUsuariosDesdeApi
   * Descarga el listado de colaboradores desde PostgreSQL (/api/usuarios) y lo
   * sincroniza con la caché local, para que la recuperación de contraseña y el
   * modo sin conexión vean a todos los usuarios registrados en la base de datos.
   */
  async cargarUsuariosDesdeApi() {
    try {
      const resp = await fetch("/api/usuarios");
      if (!resp.ok) return 0;
      const rows = await resp.json();
      if (!Array.isArray(rows)) return 0;
      rows.forEach((u) => this._syncUsuarioLocal(u));
      this.depurarUsuariosApi(rows);
      return rows.length;
    } catch (_e) {
      return 0;
    }
  }

  /**
   * depurarUsuariosApi
   * Elimina de la caché local a los colaboradores que ya no existen en
   * PostgreSQL (baja del sistema). Solo toca los que fueron sincronizados
   * desde la API (`_api: true`), nunca los creados sin conexión.
   */
  depurarUsuariosApi(filasApi) {
    if (!Array.isArray(filasApi)) return;
    const ids = new Set(filasApi.map((u) => String(u.id)));
    const correos = new Set(filasApi.map((u) => (u.email || "").toLowerCase()));
    const logins = new Set(filasApi.map((u) => u.usuario));

    const users = this.getUsers();
    const vivos = users.filter((u) => {
      if (!u._api) return true;
      return (
        ids.has(String(u.id)) ||
        correos.has((u.correo || "").toLowerCase()) ||
        logins.has(u.usuario)
      );
    });

    if (vivos.length !== users.length) this.saveUsers(vivos);
  }

  /** Guarda (o actualiza) un usuario devuelto por la API en la caché local. */
  _syncUsuarioLocal(apiUser) {
    if (!apiUser) return;
    const users = this.getUsers();
    const correo = (apiUser.email || "").toLowerCase();
    const idx = users.findIndex(
      (u) =>
        (correo && (u.correo || "").toLowerCase() === correo) ||
        (apiUser.usuario && u.usuario === apiUser.usuario) ||
        String(u.id) === String(apiUser.id),
    );

    const registro = {
      id: apiUser.id != null ? String(apiUser.id) : this._generateId(),
      usuario: apiUser.usuario,
      nombre: [apiUser.nombres, apiUser.apellidos].filter(Boolean).join(" "),
      correo: apiUser.email,
      rol: apiUser.rol,
      rolCodigo: apiUser.rolCodigo,
      tipoDocumento: apiUser.tipoDocumento,
      numDocumento: apiUser.numDocumento,
      nacionalidad: apiUser.nacionalidad,
      preguntaSeguridad: apiUser.preguntaSeguridad || "",
      _api: true,
      actualizadoEn: new Date().toISOString(),
    };

    if (idx >= 0) users[idx] = { ...users[idx], ...registro };
    else users.push(registro);

    this.saveUsers(users);
  }

  /**
   * Crea el espejo local de la sesión a partir de la respuesta del servidor.
   * La sesión real vive en una cookie HttpOnly; esto solo alimenta la UI.
   */
  _crearSesionDesdeApi(apiUser, recordar = false) {
    if (!apiUser) return;

    const now = Date.now();
    const session = {
      userId: apiUser.id,
      usuario: apiUser.usuario,
      nombre: [apiUser.nombres, apiUser.apellidos].filter(Boolean).join(" "),
      correo: apiUser.email,
      rol: apiUser.rol || "usuario",
      rolCodigo: apiUser.rolCodigo || "",
      permisos: Array.isArray(apiUser.permisos) ? apiUser.permisos : [],
      inicio: apiUser.inicio || null,
      inicioCodigo: apiUser.inicioCodigo || null,
      sinAccesos: Boolean(apiUser.sinAccesos),
      loginAt: now,
      expiresAt:
        now +
        (recordar ? AuthService.REMEMBER_TTL_MS : AuthService.SESSION_TTL_MS),
    };

    const currentUserSafe = {
      id: apiUser.id,
      usuario: apiUser.usuario,
      nombre: session.nombre,
      correo: apiUser.email,
      rol: session.rol,
      rolCodigo: session.rolCodigo,
      permisos: session.permisos,
      inicio: session.inicio,
      inicioCodigo: session.inicioCodigo,
      sinAccesos: session.sinAccesos,
    };

    StorageService.setItem(
      AuthService.STORAGE_KEYS.CURRENT_USER,
      currentUserSafe,
    );
    StorageService.setItem(AuthService.STORAGE_KEYS.SESSION, session);
    StorageService.setItem(
      AuthService.STORAGE_KEYS.REMEMBER_ME,
      Boolean(recordar),
    );

    window.dispatchEvent(
      new CustomEvent("rkal:session-updated", { detail: currentUserSafe }),
    );
  }

  /**
   * Revalida la sesión contra el servidor y actualiza permisos locales.
   * Devuelve null si la sesión ya no es válida.
   */
  async refreshSession() {
    try {
      const resp = await fetch("/api/usuarios/me", {
        credentials: "same-origin",
      });
      if (resp.status === 401) {
        this.logoutLocal();
        return null;
      }
      if (!resp.ok) return null;
      const apiUser = await resp.json();
      const recordar = Boolean(
        StorageService.getItem(AuthService.STORAGE_KEYS.REMEMBER_ME, false),
      );
      this._syncUsuarioLocal(apiUser);
      this._crearSesionDesdeApi(apiUser, recordar);
      return this.getCurrentUser();
    } catch (_err) {
      return null;
    }
  }

  hasPermission(codigo, campo = "acceder") {
    const user = this.getCurrentUser();
    if (!user) return false;
    const permiso = (user.permisos || []).find((p) => p.codigo === codigo);
    if (!permiso) return false;
    return campo === "ver"
      ? Boolean(permiso.puedeVer)
      : Boolean(permiso.puedeAcceder);
  }

  getPermisos() {
    return this.getCurrentUser()?.permisos || [];
  }

  getInicio() {
    return this.getCurrentUser()?.inicio || null;
  }

  async logout() {
    try {
      await fetch("/api/usuarios/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch (_err) {
      /* la limpieza local se hace igualmente */
    }
    this.logoutLocal();
  }

  logoutLocal() {
    StorageService.removeItem(AuthService.STORAGE_KEYS.CURRENT_USER);
    StorageService.removeItem(AuthService.STORAGE_KEYS.SESSION);
    StorageService.removeItem(AuthService.STORAGE_KEYS.REMEMBER_ME);
    StorageService.removeItem(AuthService.STORAGE_KEYS.PASSWORD_RECOVERY);
  }

  isAuthenticated() {
    const session = StorageService.getItem(
      AuthService.STORAGE_KEYS.SESSION,
      null,
    );
    if (!session) return false;
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.logout();
      return false;
    }
    return true;
  }

  getCurrentUser() {
    if (!this.isAuthenticated()) return null;
    return StorageService.getItem(AuthService.STORAGE_KEYS.CURRENT_USER, null);
  }

  getSession() {
    if (!this.isAuthenticated()) return null;
    return StorageService.getItem(AuthService.STORAGE_KEYS.SESSION, null);
  }

  renewSession() {
    const session = this.getSession();
    if (!session) return;
    const recordar = Boolean(
      StorageService.getItem(AuthService.STORAGE_KEYS.REMEMBER_ME, false),
    );
    session.expiresAt =
      Date.now() +
      (recordar ? AuthService.REMEMBER_TTL_MS : AuthService.SESSION_TTL_MS);
    StorageService.setItem(AuthService.STORAGE_KEYS.SESSION, session);
  }

  /**
   * La recuperación se resuelve en el servidor: la pregunta y la respuesta
   * viven en PostgreSQL y el cambio de contraseña actualiza el hash real.
   */
  async _solicitudRecuperacion(ruta, cuerpo) {
    try {
      const resp = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo || {}),
      });
      let data = null;
      try {
        data = await resp.json();
      } catch (_err) {
        data = null;
      }
      if (!resp.ok) {
        return {
          success: false,
          status: resp.status,
          message:
            data?.error ||
            data?.mensaje ||
            "No se pudo completar la operación.",
        };
      }
      return { success: true, ...(data || {}) };
    } catch (_err) {
      return {
        success: false,
        message:
          "No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.",
      };
    }
  }

  async iniciarRecuperacionContrasena(identificador) {
    const res = await this._solicitudRecuperacion(
      "/api/usuarios/recuperacion/iniciar",
      { identificador },
    );
    if (!res.success) return res;
    return {
      ...res,
      userData: {
        usuario: res.usuario,
        correo: res.correo,
        preguntaSeguridad: res.preguntaSeguridad,
      },
    };
  }

  verificarRespuestaSeguridad(solicitudId, respuesta) {
    return this._solicitudRecuperacion("/api/usuarios/recuperacion/verificar", {
      solicitudId,
      respuesta,
    });
  }

  restablecerContrasena(token, nuevaContrasena) {
    if (!nuevaContrasena || nuevaContrasena.length < 6) {
      return Promise.resolve({
        success: false,
        message: "La contraseña debe tener al menos 6 caracteres.",
      });
    }
    return this._solicitudRecuperacion(
      "/api/usuarios/recuperacion/restablecer",
      {
        token,
        contrasena: nuevaContrasena,
      },
    );
  }

  requireAuth(loginPath) {
    const resolvedPath = loginPath || "../auth/login.html";
    if (!this.isAuthenticated()) {
      window.location.replace(resolvedPath);
    }
  }

  async redirectIfAuthenticated(dashboardPath) {
    const resolvedPath = dashboardPath || "../pages/dashboard.html";
    // La cookie HttpOnly es la fuente de verdad. No redirigir solo por la
    // caché local: si la sesión del servidor expiró, se produce un bucle
    // login -> dashboard -> login.
    const user = await this.refreshSession();
    if (user) {
      window.location.replace(resolvedPath);
      return true;
    }
    return false;
  }
}
