const crypto = require("crypto");
const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const { hashPassword, verifyPassword } = require("../lib/passwords");
const { cifrarCredencial, descifrarCredencial } = require("../lib/credentials");
const { createSession, destroySession } = require("../lib/session");
const { getPermisosEfectivos, getInicio } = require("../services/rbac.service");
const handlers = {};

const RECUPERACION_TTL_MINUTOS = 10;
const MAX_INTENTOS_RESPUESTA = 5;

function sha256(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex");
}

/** Normaliza la respuesta para que mayúsculas, tildes y espacios no importen. */
function normalizarRespuesta(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generarContrasenaTemporal(row) {
  const limpiar = (valor) =>
    String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9]/g, "");
  const apellido = limpiar(row.apellidos) || "rkal";
  const nombre = limpiar(row.nombres) || "usuario";
  return `${apellido}.${nombre}_${new Date().getFullYear()}`;
}
/* -------------------------------------------------------------------------- */
/* Mapeo de roles: etiqueta de la interfaz <-> nombre en la base de datos       */
/* -------------------------------------------------------------------------- */
const ROL_UI_A_DB = {
  Administrador: "administrador",
  Vendedor: "vendedor",
  "Jefe General": "jefe_general",
  "Jefe de Tienda": "jefa_tienda",
  "Jefa de Tienda": "jefa_tienda",
  "Subjefe de Tienda": "subjefe_tienda",
  "Personal de Almacén": "personal_almacen",
  Cliente: "cliente",
};

const ROL_DB_A_UI = Object.fromEntries(
  Object.entries(ROL_UI_A_DB).map(([ui, db]) => [db, ui])
);

/**
 * Devuelve el id_rol en BD a partir de la etiqueta de rol del frontend
 * ("Personal de Almacén") o de un id numérico enviado directamente.
 */
async function resolverIdRol(rol, idRol) {
  if (idRol !== undefined && idRol !== null && idRol !== "") {
    const n = Number(idRol);
    if (Number.isFinite(n)) return n;
  }
  if (!rol) return null;

  const slug = ROL_UI_A_DB[rol] || (ROL_DB_A_UI[rol] ? rol : null);
  if (!slug) return null;

  const { rows } = await DatabaseModel.query(
    `SELECT id_rol
       FROM roles
      WHERE codigo = $1 OR nombre_rol = $1
      LIMIT 1`,
    [slug]
  );
  return rows[0] ? rows[0].id_rol : null;
}

/**
 * Un usuario solo puede recibir un rol existente y activo. Los roles en
 * borrador o inactivos no deben asignarse (BR-11 del diseño RBAC).
 */
async function validarRolAsignable(idRol, solicitado = false) {
  if (!idRol) {
    return {
      ok: false,
      status: 400,
      error: solicitado
        ? "El rol seleccionado no existe."
        : "El rol es obligatorio.",
    };
  }
  const { rows } = await DatabaseModel.query(
    "SELECT estado FROM roles WHERE id_rol = $1",
    [idRol]
  );
  if (!rows.length) {
    return { ok: false, status: 400, error: "El rol seleccionado no existe." };
  }
  if (rows[0].estado !== "activo") {
    return {
      ok: false,
      status: 422,
      error: "Solo se pueden asignar roles activos. Activa el rol antes de usarlo.",
    };
  }
  return { ok: true };
}

const SELECT_USUARIOS = `
    SELECT u.id_usuario, u.nombres, u.apellidos, u.tipo_de_documento, u.dni,
           u.usuario_login, u.correo, u.nacionalidad, u.estado,
           u.pregunta_seguridad, u.contrasena_visible,
           u.fecha_creacion, u.ultimo_acceso, u.id_rol,
           r.nombre_rol, r.codigo AS rol_codigo
      FROM usuarios u
      LEFT JOIN roles r ON r.id_rol = u.id_rol`;

/**
 * Convierte una fila de BD al modelo que consume el frontend.
 * La contraseña recuperable solo se incluye en las rutas administrativas.
 */
function mapUsuario(row, opciones = {}) {
  if (!row) return null;
  const usuario = {
    id: row.id_usuario,
    nombres: row.nombres || "",
    apellidos: row.apellidos || "",
    tipoDocumento: row.tipo_de_documento || "dni",
    numDocumento: row.dni || "",
    usuario: row.usuario_login || "",
    email: row.correo || "",
    nacionalidad: row.nacionalidad || "Peruana",
    preguntaSeguridad: row.pregunta_seguridad || "",
    estado: !row.estado || row.estado === "activo" ? "Activo" : "Inactivo",
    idRol: row.id_rol,
    rol: ROL_DB_A_UI[row.rol_codigo || row.nombre_rol] || row.nombre_rol || "",
    rolCodigo: row.rol_codigo || row.nombre_rol || "",
    creadoEn: row.fecha_creacion,
    ultimoAcceso: row.ultimo_acceso,
  };
  if (opciones.incluirContrasena) {
    usuario.contrasena = descifrarCredencial(row.contrasena_visible);
  }
  return usuario;
}

async function usuarioConPermisos(row) {
  const usuario = mapUsuario(row);
  if (!usuario) return null;
  const permisos = await getPermisosEfectivos(usuario.idRol);
  const inicio = await getInicio(usuario.idRol);
  return {
    ...usuario,
    permisos,
    inicio: inicio ? inicio.ruta || null : null,
    inicioCodigo: inicio ? inicio.codigo : null,
    sinAccesos: !permisos.some((p) => p.puedeAcceder),
  };
}

function errorDeLlave(err, res) {
  if (err.code === "23505") {
    const campo = (err.detail || "").replace(/^Key \((.+?)\)=.*$/, "$1");
    return JsonView.send(res, 409, {
      error: `Ya existe un usuario con ese dato (${campo || "valor duplicado"}).`,
    });
  }
  return JsonView.send(res, 500, { error: err.message });
}

/* -------------------------------------------------------------------------- */
/* GET /api/usuarios  -> listado completo (Gestión de Usuarios / Roles)         */
/* -------------------------------------------------------------------------- */
handlers['GET /'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query(`${SELECT_USUARIOS} ORDER BY u.id_usuario`);
    JsonView.send(
      res,
      200,
      rows.map((row) => mapUsuario(row, { incluirContrasena: true }))
    );
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* GET /api/usuarios/:id                                                       */
/* -------------------------------------------------------------------------- */
handlers['GET /:id'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query(`${SELECT_USUARIOS} WHERE u.id_usuario = $1`, [
      req.params.id,
    ]);
    if (!rows.length) return JsonView.send(res, 404, { error: "Usuario no encontrado." });
    JsonView.send(
      res,
      200,
      mapUsuario(rows[0], { incluirContrasena: true })
    );
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios  -> crear colaborador                                    */
/* -------------------------------------------------------------------------- */
handlers['POST /'] = async (req, res) => {
  try {
    const {
      nombres, apellidos, tipoDocumento, tipo_de_documento,
      numDocumento, dni, nacionalidad, email, correo,
      usuario, usuario_login, contrasena, rol, id_rol,
      preguntaSeguridad, pregunta_seguridad,
      respuestaSeguridad, respuesta_seguridad,
    } = req.body;

    if (!contrasena) {
      return JsonView.send(res, 400, { error: "La contraseña es obligatoria." });
    }

    const pregunta = String(preguntaSeguridad || pregunta_seguridad || "").trim();
    const respuesta = String(respuestaSeguridad || respuesta_seguridad || "").trim();
    if ((pregunta && !respuesta) || (!pregunta && respuesta)) {
      return JsonView.send(res, 400, {
        error: "La pregunta y la respuesta de seguridad deben registrarse juntas.",
      });
    }

    const idRol = await resolverIdRol(rol, id_rol);
    const rolValido = await validarRolAsignable(idRol, Boolean(rol || id_rol));
    if (!rolValido.ok) {
      return JsonView.send(res, rolValido.status, { error: rolValido.error });
    }
    const claveHasheada = await hashPassword(String(contrasena));
    const credencialCifrada = cifrarCredencial(String(contrasena));
    const respuestaHasheada = respuesta
      ? await hashPassword(normalizarRespuesta(respuesta))
      : null;

    const { rows } = await DatabaseModel.query(
      `INSERT INTO usuarios
         (nombres, apellidos, tipo_de_documento, dni, usuario_login, contrasena,
          contrasena_visible, correo, nacionalidad, id_rol, estado,
          pregunta_seguridad, respuesta_seguridad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'activo',$11,$12)
       RETURNING id_usuario`,
      [
        nombres,
        apellidos || "",
        tipoDocumento || tipo_de_documento || "dni",
        numDocumento || dni || "",
        usuario || usuario_login,
        claveHasheada,
        credencialCifrada,
        email || correo || null,
        nacionalidad || "Peruana",
        idRol,
        pregunta || null,
        respuestaHasheada,
      ]
    );

    const { rows: creados } = await DatabaseModel.query(
      `${SELECT_USUARIOS} WHERE u.id_usuario = $1`,
      [rows[0].id_usuario]
    );
    JsonView.send(
      res,
      201,
      mapUsuario(creados[0], { incluirContrasena: true })
    );
  } catch (err) {
    errorDeLlave(err, res);
  }
};

/* -------------------------------------------------------------------------- */
/* PUT /api/usuarios/:id  -> editar colaborador                                */
/* -------------------------------------------------------------------------- */
handlers['PUT /:id'] = async (req, res) => {
  try {
    const {
      nombres, apellidos, tipoDocumento, tipo_de_documento,
      numDocumento, dni, nacionalidad, email, correo,
      usuario, usuario_login, contrasena, rol, id_rol, estado,
      preguntaSeguridad, pregunta_seguridad,
      respuestaSeguridad, respuesta_seguridad,
    } = req.body;

    const pregunta = String(preguntaSeguridad || pregunta_seguridad || "").trim();
    const respuesta = String(respuestaSeguridad || respuesta_seguridad || "").trim();
    if (pregunta && !respuesta) {
      return JsonView.send(res, 400, {
        error: "Para cambiar la pregunta de seguridad debes indicar una nueva respuesta.",
      });
    }
    if (respuesta && !pregunta) {
      return JsonView.send(res, 400, {
        error: "Indica la pregunta de seguridad junto con la respuesta.",
      });
    }

    const idRol = await resolverIdRol(rol, id_rol);
    const rolSolicitado =
      (id_rol !== undefined && id_rol !== null && id_rol !== "") ||
      (rol !== undefined && rol !== null && rol !== "");
    if (rolSolicitado) {
      const rolValido = await validarRolAsignable(idRol, true);
      if (!rolValido.ok) {
        return JsonView.send(res, rolValido.status, { error: rolValido.error });
      }
    }
    const est = (estado || "Activo").toString().toLowerCase() === "activo"
      ? "activo"
      : "inactivo";
    const claveHasheada = contrasena ? await hashPassword(String(contrasena)) : null;
    const credencialCifrada = contrasena ? cifrarCredencial(String(contrasena)) : null;
    const respuestaHasheada = respuesta
      ? await hashPassword(normalizarRespuesta(respuesta))
      : null;

    const { rowCount } = await DatabaseModel.query(
      `UPDATE usuarios
          SET nombres          = COALESCE($1, nombres),
              apellidos        = COALESCE($2, apellidos),
              tipo_de_documento = COALESCE($3, tipo_de_documento),
              dni              = COALESCE($4, dni),
              usuario_login    = COALESCE($5, usuario_login),
              correo           = COALESCE($6, correo),
              nacionalidad     = COALESCE($7, nacionalidad),
              contrasena       = COALESCE($8, contrasena),
              contrasena_visible = COALESCE($9, contrasena_visible),
              id_rol           = COALESCE($10, id_rol),
              estado           = $11,
              pregunta_seguridad  = COALESCE($12, pregunta_seguridad),
              respuesta_seguridad = COALESCE($13, respuesta_seguridad)
        WHERE id_usuario = $14`,
      [
        nombres, apellidos,
        tipoDocumento || tipo_de_documento || null,
        numDocumento || dni || null,
        usuario || usuario_login || null,
        email || correo || null,
        nacionalidad || null,
        claveHasheada,
        credencialCifrada,
        idRol,
        est,
        pregunta || null,
        respuestaHasheada,
        req.params.id,
      ]
    );

    if (!rowCount) return JsonView.send(res, 404, { error: "Usuario no encontrado." });

    const { rows } = await DatabaseModel.query(`${SELECT_USUARIOS} WHERE u.id_usuario = $1`, [
      req.params.id,
    ]);
    JsonView.send(
      res,
      200,
      mapUsuario(rows[0], { incluirContrasena: true })
    );
  } catch (err) {
    errorDeLlave(err, res);
  }
};

/* -------------------------------------------------------------------------- */
/* DELETE /api/usuarios/:id                                                    */
/* -------------------------------------------------------------------------- */
handlers['DELETE /:id'] = async (req, res) => {
  try {
    const { rowCount } = await DatabaseModel.query(
      "DELETE FROM usuarios WHERE id_usuario = $1",
      [req.params.id]
    );
    if (!rowCount) return JsonView.send(res, 404, { error: "Usuario no encontrado." });
    JsonView.send(res, 200, { ok: true, id: Number(req.params.id) });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/:id/restablecer -> contraseña temporal (administrador)  */
/* -------------------------------------------------------------------------- */
handlers['POST /:id/restablecer'] = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return JsonView.send(res, 400, { error: "Usuario inválido." });
    }

    const { rows } = await DatabaseModel.query(
      "SELECT id_usuario, nombres, apellidos FROM usuarios WHERE id_usuario = $1",
      [id]
    );
    if (!rows.length) {
      return JsonView.send(res, 404, { error: "Usuario no encontrado." });
    }

    const contrasena = generarContrasenaTemporal(rows[0]);
    const hash = await hashPassword(contrasena);
    await DatabaseModel.query(
      "UPDATE usuarios SET contrasena = $1, contrasena_visible = $2 WHERE id_usuario = $3",
      [hash, cifrarCredencial(contrasena), id]
    );
    // Las sesiones y solicitudes de recuperación abiertas dejan de ser válidas.
    await DatabaseModel.query("DELETE FROM sesiones WHERE id_usuario = $1", [id]);
    await DatabaseModel.query(
      "DELETE FROM recuperaciones_contrasena WHERE id_usuario = $1",
      [id]
    );

    JsonView.send(res, 200, { ok: true, contrasena });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/login  -> autentica con correo institucional             */
/*                                 (o usuario) + contraseña                    */
/* -------------------------------------------------------------------------- */
const intentosLogin = new Map();
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

function limitarIntentos(clave) {
  const ahora = Date.now();
  const actual = intentosLogin.get(clave);

  if (!actual || ahora - actual.desde > VENTANA_INTENTOS_MS) {
    intentosLogin.set(clave, { desde: ahora, cantidad: 1 });
    return true;
  }

  actual.cantidad += 1;
  return actual.cantidad <= MAX_INTENTOS;
}

handlers['POST /login'] = async (req, res) => {
  try {
    const { identificador, usuario, usuario_login, correo, contrasena, recordar } = req.body || {};
    const id = String(
      identificador || usuario || usuario_login || correo || ""
    ).trim();

    if (!id || !contrasena) {
      return JsonView.send(res, 400, { error: "Correo y contraseña son obligatorios." });
    }

    const claveLimite = `${req.ip || "local"}:${id.toLowerCase()}`;
    if (!limitarIntentos(claveLimite)) {
      return JsonView.send(res, 429, {
        error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      });
    }

    const { rows } = await DatabaseModel.query(
      `SELECT u.id_usuario, u.contrasena, u.estado, u.id_rol,
              r.nombre_rol, r.codigo AS rol_codigo, r.estado AS rol_estado
         FROM usuarios u
         LEFT JOIN roles r ON r.id_rol = u.id_rol
        WHERE (LOWER(u.correo) = LOWER($1) OR LOWER(u.usuario_login) = LOWER($1))
        LIMIT 1`,
      [id]
    );

    const row = rows[0];
    const verificacion = row
      ? await verifyPassword(String(contrasena), row.contrasena || "")
      : { ok: false, needsRehash: false };

    if (!row || !verificacion.ok) {
      return JsonView.send(res, 401, { error: "Correo o contraseña incorrectos." });
    }

    if (row.estado !== "activo") {
      return JsonView.send(res, 403, { error: "El usuario está inactivo. Contacta al administrador." });
    }

    if (row.rol_estado && row.rol_estado !== "activo") {
      return JsonView.send(res, 403, { error: "El rol asignado está inactivo. Contacta al administrador." });
    }

    // Migración transparente: contraseña legada en texto plano -> scrypt.
    if (verificacion.needsRehash) {
      const nueva = await hashPassword(String(contrasena));
      await DatabaseModel.query(
        "UPDATE usuarios SET contrasena = $1 WHERE id_usuario = $2",
        [nueva, row.id_usuario]
      );
    }

    await DatabaseModel.query(
      "UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id_usuario = $1",
      [row.id_usuario]
    );

    await createSession(req, res, row.id_usuario, Boolean(recordar));
    intentosLogin.delete(claveLimite);

    const { rows: completos } = await DatabaseModel.query(
      `${SELECT_USUARIOS} WHERE u.id_usuario = $1`,
      [row.id_usuario]
    );
    const data = await usuarioConPermisos(completos[0]);

    JsonView.send(res, 200, data);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/recuperacion/iniciar                                     */
/* -------------------------------------------------------------------------- */
handlers['POST /recuperacion/iniciar'] = async (req, res) => {
  try {
    const identificador = String(req.body?.identificador || "").trim();
    if (!identificador) {
      return JsonView.send(res, 400, { error: "Ingresa tu usuario o correo electrónico." });
    }

    const claveLimite = `recuperacion:${req.ip || "local"}:${identificador.toLowerCase()}`;
    if (!limitarIntentos(claveLimite)) {
      return JsonView.send(res, 429, {
        error: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      });
    }

    const { rows } = await DatabaseModel.query(
      `SELECT id_usuario, usuario_login, correo, estado,
              pregunta_seguridad, respuesta_seguridad
         FROM usuarios
        WHERE LOWER(correo) = LOWER($1) OR LOWER(usuario_login) = LOWER($1)
        LIMIT 1`,
      [identificador]
    );
    const user = rows[0];
    if (!user) {
      return JsonView.send(res, 404, {
        error: "No se encontró ninguna cuenta con ese usuario o correo electrónico.",
      });
    }
    if (user.estado !== "activo") {
      return JsonView.send(res, 403, {
        error: "La cuenta está inactiva. Contacta al administrador.",
      });
    }
    if (!user.pregunta_seguridad || !user.respuesta_seguridad) {
      return JsonView.send(res, 422, {
        error:
          "Esta cuenta no tiene pregunta de seguridad configurada. Contacta al administrador para restablecer la contraseña.",
      });
    }

    await DatabaseModel.query(
      `DELETE FROM recuperaciones_contrasena
        WHERE id_usuario = $1 AND (usado = TRUE OR expira_en < now())`,
      [user.id_usuario]
    );

    const solicitudId = crypto.randomBytes(32).toString("hex");
    await DatabaseModel.query(
      `INSERT INTO recuperaciones_contrasena (id_usuario, token_hash, expira_en)
       VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.id_usuario, sha256(solicitudId), String(RECUPERACION_TTL_MINUTOS)]
    );

    JsonView.send(res, 200, {
      solicitudId,
      usuario: user.usuario_login,
      correo: user.correo || "",
      preguntaSeguridad: user.pregunta_seguridad,
    });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/recuperacion/verificar                                   */
/* -------------------------------------------------------------------------- */
handlers['POST /recuperacion/verificar'] = async (req, res) => {
  try {
    const solicitudId = String(req.body?.solicitudId || "").trim();
    const respuesta = String(req.body?.respuesta || "").trim();
    if (!solicitudId || !respuesta) {
      return JsonView.send(res, 400, {
        error: "La solicitud y la respuesta de seguridad son obligatorias.",
      });
    }
    if (respuesta.length > 200) {
      return JsonView.send(res, 400, { error: "La respuesta de seguridad es demasiado larga." });
    }

    const { rows } = await DatabaseModel.query(
      `SELECT r.id_recuperacion, r.id_usuario, r.intentos, r.expira_en, r.usado,
              u.respuesta_seguridad, u.estado
         FROM recuperaciones_contrasena r
         JOIN usuarios u ON u.id_usuario = r.id_usuario
        WHERE r.token_hash = $1
        LIMIT 1`,
      [sha256(solicitudId)]
    );
    const rec = rows[0];
    if (!rec || rec.usado || new Date(rec.expira_en).getTime() <= Date.now()) {
      return JsonView.send(res, 410, {
        error: "La solicitud de recuperación expiró. Vuelve a iniciar el proceso.",
      });
    }
    if (rec.estado !== "activo") {
      return JsonView.send(res, 403, {
        error: "La cuenta está inactiva. Contacta al administrador.",
      });
    }
    if (Number(rec.intentos) >= MAX_INTENTOS_RESPUESTA) {
      return JsonView.send(res, 429, {
        error: "Demasiados intentos. Vuelve a iniciar el proceso de recuperación.",
      });
    }

    const verificacion = await verifyPassword(
      normalizarRespuesta(respuesta),
      rec.respuesta_seguridad || ""
    );
    if (!verificacion.ok) {
      await DatabaseModel.query(
        "UPDATE recuperaciones_contrasena SET intentos = intentos + 1 WHERE id_recuperacion = $1",
        [rec.id_recuperacion]
      );
      return JsonView.send(res, 401, { error: "La respuesta de seguridad no es correcta." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await DatabaseModel.query(
      `UPDATE recuperaciones_contrasena
          SET token_hash = $1, verificado = TRUE, intentos = 0,
              expira_en = now() + ($2 || ' minutes')::interval
        WHERE id_recuperacion = $3`,
      [sha256(token), String(RECUPERACION_TTL_MINUTOS), rec.id_recuperacion]
    );

    JsonView.send(res, 200, { token });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/recuperacion/restablecer                                 */
/* -------------------------------------------------------------------------- */
handlers['POST /recuperacion/restablecer'] = async (req, res) => {
  let client;
  try {
    client = await DatabaseModel.connect();
    const token = String(req.body?.token || "").trim();
    const contrasena = String(req.body?.contrasena || "");
    if (!token || !contrasena) {
      return JsonView.send(res, 400, { error: "El token y la nueva contraseña son obligatorios." });
    }
    if (contrasena.length < 6) {
      return JsonView.send(res, 400, {
        error: "La contraseña debe tener al menos 6 caracteres.",
      });
    }

    const { rows } = await client.query(
      `SELECT id_recuperacion, id_usuario
         FROM recuperaciones_contrasena
        WHERE token_hash = $1 AND verificado = TRUE AND usado = FALSE
          AND expira_en > now()
        LIMIT 1`,
      [sha256(token)]
    );
    const rec = rows[0];
    if (!rec) {
      return JsonView.send(res, 410, {
        error: "El enlace de recuperación expiró. Vuelve a iniciar el proceso.",
      });
    }

    const hash = await hashPassword(contrasena);
    await client.query("BEGIN");
    await client.query(
      "UPDATE usuarios SET contrasena = $1, contrasena_visible = $2 WHERE id_usuario = $3",
      [hash, cifrarCredencial(contrasena), rec.id_usuario]
    );
    await client.query(
      "UPDATE recuperaciones_contrasena SET usado = TRUE WHERE id_recuperacion = $1",
      [rec.id_recuperacion]
    );
    await client.query("DELETE FROM sesiones WHERE id_usuario = $1", [rec.id_usuario]);
    await client.query(
      "DELETE FROM recuperaciones_contrasena WHERE id_usuario = $1 AND id_recuperacion <> $2",
      [rec.id_usuario, rec.id_recuperacion]
    );
    await client.query("COMMIT");

    JsonView.send(res, 200, { ok: true });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    JsonView.send(res, 500, { error: err.message });
  } finally {
    if (client) client.release();
  }
};

/* -------------------------------------------------------------------------- */
/* GET /api/usuarios/me  -> sesión actual + permisos efectivos                 */
/* -------------------------------------------------------------------------- */
handlers['GET /me'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query(
      `${SELECT_USUARIOS} WHERE u.id_usuario = $1`,
      [req.usuario.idUsuario]
    );
    if (!rows.length) {
      return JsonView.send(res, 401, { error: "NO_AUTENTICADO" });
    }
    JsonView.send(res, 200, await usuarioConPermisos(rows[0]));
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

/* -------------------------------------------------------------------------- */
/* POST /api/usuarios/logout                                                   */
/* -------------------------------------------------------------------------- */
handlers['POST /logout'] = async (req, res) => {
  try {
    await destroySession(req, res);
    JsonView.send(res, 200, { ok: true });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

module.exports = handlers;
