const pool = require("../config/db");
const JsonView = require("../views/json.view");
const {
  getArbolSecciones,
  getSeccionesPlanas,
  getRoles,
  getMatriz,
} = require("../services/rbac.service");

const CODIGO_ROL_VALIDO = /^[a-z][a-z0-9_]{2,49}$/;

function normalizarPermisos(permisos = []) {
  const mapa = new Map();
  for (const p of permisos) {
    const idSeccion = Number(p.idSeccion);
    if (!Number.isInteger(idSeccion) || idSeccion <= 0) continue;
    const ver = Boolean(p.ver ?? p.puedeVer);
    const acceder = Boolean(p.acceder ?? p.puedeAcceder);
    mapa.set(idSeccion, { ver, acceder });
  }
  return mapa;
}

function validarJerarquia(secciones, permisos) {
  const errores = [];

  for (const seccion of secciones) {
    const permiso = permisos.get(seccion.idSeccion) || { ver: false, acceder: false };
    if (permiso.ver && !permiso.acceder) {
      errores.push(`${seccion.codigo}: visible requiere acceso`);
    }
  }

  return errores;
}

async function obtenerRol(idRol) {
  const { rows } = await pool.query(
    `SELECT r.id_rol AS "idRol", r.codigo, r.nombre_rol AS "nombre",
            r.descripcion, r.estado, r.es_sistema AS "esSistema",
            r.version_permisos AS "version",
            r.actualizado_en AS "actualizadoEn",
            COUNT(u.id_usuario) FILTER (WHERE u.estado = 'activo') AS "usuariosActivos"
       FROM roles r
       LEFT JOIN usuarios u ON u.id_rol = r.id_rol
      WHERE r.id_rol = $1
      GROUP BY r.id_rol`,
    [idRol]
  );
  const rol = rows[0];
  if (!rol) return null;
  rol.usuariosActivos = Number(rol.usuariosActivos) || 0;
  return rol;
}

async function matrizActual(idRol) {
  const { rows } = await pool.query(
    `SELECT id_seccion AS "idSeccion",
            puede_ver AS "puedeVer",
            puede_acceder AS "puedeAcceder"
       FROM permisos_rol
      WHERE id_rol = $1`,
    [idRol]
  );
  const mapa = new Map(rows.map((r) => [r.idSeccion, r]));
  return mapa;
}

/* -------------------------------------------------------------------------- */
/* GET /api/rbac/roles                                                        */
/* -------------------------------------------------------------------------- */
async function listarRoles(req, res) {
  try {
    const roles = await getRoles({ excluirRol: req.usuario.idRol });
    JsonView.send(res, 200, roles);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/rbac/secciones                                                    */
/* -------------------------------------------------------------------------- */
async function listarSecciones(req, res) {
  try {
    const [arbol, planas] = await Promise.all([getArbolSecciones(), getSeccionesPlanas()]);
    JsonView.send(res, 200, { arbol, secciones: planas });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/rbac/roles/:id/permisos                                           */
/* -------------------------------------------------------------------------- */
async function obtenerPermisosRol(req, res) {
  try {
    const idRol = Number(req.params.id);
    if (!Number.isInteger(idRol)) {
      return JsonView.send(res, 400, { error: "ID de rol inválido." });
    }

    const rol = await obtenerRol(idRol);
    if (!rol) return JsonView.send(res, 404, { error: "Rol no encontrado." });

    const secciones = await getSeccionesPlanas();
    const actuales = await matrizActual(idRol);

    const permisos = secciones.map((s) => {
      const p = actuales.get(s.idSeccion);
      return {
        idSeccion: s.idSeccion,
        codigo: s.codigo,
        puedeVer: Boolean(p?.puedeVer),
        puedeAcceder: Boolean(p?.puedeAcceder),
      };
    });

    JsonView.send(res, 200, {
      rol,
      version: rol.version,
      esPropio: rol.idRol === req.usuario.idRol,
      secciones,
      permisos,
    });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/rbac/roles/:id/permisos                                           */
/* -------------------------------------------------------------------------- */
async function guardarPermisosRol(req, res) {
  const idRol = Number(req.params.id);
  const actor = req.usuario;

  if (!Number.isInteger(idRol)) {
    return JsonView.send(res, 400, { error: "ID de rol inválido." });
  }
  if (idRol === actor.idRol) {
    return JsonView.send(res, 403, {
      error: "SELF_EDIT_NOT_ALLOWED",
      mensaje: "No puedes modificar los permisos de tu propio rol.",
    });
  }

  const body = req.body || {};
  const version = Number(body.version);
  const motivo = body.motivo ? String(body.motivo).slice(0, 300) : null;
  const permisos = normalizarPermisos(body.permisos);

  if (!Number.isInteger(version)) {
    return JsonView.send(res, 400, { error: "Falta la versión de los permisos." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: roles } = await client.query(
      `SELECT id_rol AS "idRol", codigo, nombre_rol AS "nombre",
              version_permisos AS "version", estado
         FROM roles
        WHERE id_rol = $1
        FOR UPDATE`,
      [idRol]
    );
    const rol = roles[0];
    if (!rol) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 404, { error: "Rol no encontrado." });
    }

    if (rol.version !== version) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 409, {
        error: "VERSION_CONFLICT",
        versionActual: rol.version,
        mensaje: "Otro usuario modificó estos permisos. Recarga la matriz.",
      });
    }

    const { rows: secciones } = await client.query(
      `SELECT id_seccion AS "idSeccion", codigo, id_padre AS "idPadre",
              es_protegida AS "esProtegida", es_inicio AS "esInicio"
         FROM secciones
        WHERE estado = 'activo'
        ORDER BY orden, id_seccion`
    );

    if (!secciones.length) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 409, { error: "NO_SECTIONS", mensaje: "No hay secciones configuradas." });
    }

    // Las secciones protegidas no se pueden alterar desde el panel.
    const actuales = await matrizActual(idRol);
    for (const seccion of secciones.filter((s) => s.esProtegida)) {
      const antes = actuales.get(seccion.idSeccion) || { puedeVer: false, puedeAcceder: false };
      const despues = permisos.get(seccion.idSeccion) || { ver: false, acceder: false };
      if (Boolean(antes.puedeVer) !== despues.ver || Boolean(antes.puedeAcceder) !== despues.acceder) {
        await client.query("ROLLBACK");
        return JsonView.send(res, 403, {
          error: "PROTECTED_SECTION",
          seccion: seccion.codigo,
          mensaje: "Esta sección está protegida y no puede modificarse desde el panel.",
        });
      }
    }

    // Si una sección protegida tiene acceso efectivo, sus ancestros deben
    // conservar el acceso. De lo contrario se podría dejar el panel de
    // permisos inaccesible para todos (bloqueo por ancestro).
    const seccionesPorId = new Map(secciones.map((s) => [s.idSeccion, s]));
    for (const protegida of secciones.filter((s) => s.esProtegida)) {
      if (!actuales.get(protegida.idSeccion)?.puedeAcceder) continue;
      let padreId = protegida.idPadre;
      while (padreId && seccionesPorId.has(padreId)) {
        const padre = seccionesPorId.get(padreId);
        const permisoPadre = permisos.get(padre.idSeccion) || { ver: false, acceder: false };
        if (!permisoPadre.acceder) {
          await client.query("ROLLBACK");
          return JsonView.send(res, 403, {
            error: "PROTECTED_ANCESTOR",
            seccion: padre.codigo,
            mensaje: "No puedes quitar el acceso a una sección necesaria para el panel de permisos.",
          });
        }
        padreId = padre.idPadre;
      }
    }

    const errores = validarJerarquia(secciones, permisos);
    if (errores.length) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 422, {
        error: "JERARQUIA_INVALIDA",
        detalles: errores.slice(0, 20),
      });
    }

    // Snapshot anterior para auditoría
    const { rows: antes } = await client.query(
      `SELECT id_seccion AS "idSeccion", codigo,
              puede_ver AS "puedeVer", puede_acceder AS "puedeAcceder"
         FROM permisos_rol pr
         JOIN secciones s USING (id_seccion)
        WHERE pr.id_rol = $1
        ORDER BY s.orden`,
      [idRol]
    );

    const antesMap = new Map(antes.map((a) => [a.idSeccion, a]));

    for (const seccion of secciones) {
      const p = permisos.get(seccion.idSeccion) || { ver: false, acceder: false };
      await client.query(
        `INSERT INTO permisos_rol
           (id_rol, id_seccion, puede_ver, puede_acceder, actualizado_por)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_rol, id_seccion)
         DO UPDATE SET
           puede_ver = EXCLUDED.puede_ver,
           puede_acceder = EXCLUDED.puede_acceder,
           actualizado_por = EXCLUDED.actualizado_por`,
        [idRol, seccion.idSeccion, p.ver, p.acceder, actor.idUsuario]
      );
    }

    // Si el payload no incluye una sección, se deniega.
    const ids = secciones.map((s) => s.idSeccion);
    await client.query(
      `UPDATE permisos_rol
          SET puede_ver = FALSE, puede_acceder = FALSE, actualizado_por = $2
        WHERE id_rol = $1
          AND NOT (id_seccion = ANY($3::int[]))`,
      [idRol, actor.idUsuario, ids]
    );

    const despues = secciones.map((s) => {
      const p = permisos.get(s.idSeccion) || { ver: false, acceder: false };
      return {
        idSeccion: s.idSeccion,
        codigo: s.codigo,
        puedeVer: p.ver,
        puedeAcceder: p.acceder,
      };
    });

    const cambios = [];
    for (const d of despues) {
      const a = antesMap.get(d.idSeccion) || { puedeVer: false, puedeAcceder: false };
      if (Boolean(a.puedeVer) !== d.puedeVer || Boolean(a.puedeAcceder) !== d.puedeAcceder) {
        cambios.push({
          idSeccion: d.idSeccion,
          codigo: d.codigo,
          antes: { ver: Boolean(a.puedeVer), acceder: Boolean(a.puedeAcceder) },
          despues: { ver: d.puedeVer, acceder: d.puedeAcceder },
        });
      }
    }

    if (!cambios.length) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 200, {
        ok: true,
        sinCambios: true,
        version: rol.version,
      });
    }

    await client.query(
      "UPDATE roles SET version_permisos = version_permisos + 1 WHERE id_rol = $1",
      [idRol]
    );

    const antesDiff = cambios.map((c) => ({ codigo: c.codigo, ...c.antes }));
    const despuesDiff = cambios.map((c) => ({ codigo: c.codigo, ...c.despues }));

    await client.query(
      `INSERT INTO auditoria_permisos
         (id_actor, id_rol, accion, antes, despues, motivo, ip)
       VALUES ($1, $2, 'actualizar_permisos', $3::jsonb, $4::jsonb, $5, $6)`,
      [
        actor.idUsuario,
        idRol,
        JSON.stringify(antesDiff),
        JSON.stringify(despuesDiff),
        motivo,
        req.ip || null,
      ]
    );

    await client.query("COMMIT");

    JsonView.send(res, 200, {
      ok: true,
      version: rol.version + 1,
      resumen: {
        cambios: cambios.length,
        otorgados: cambios.filter((c) => !c.antes.acceder && c.despues.acceder).length,
        revocados: cambios.filter((c) => c.antes.acceder && !c.despues.acceder).length,
        ocultados: cambios.filter((c) => c.antes.ver && !c.despues.ver).length,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    JsonView.send(res, 500, { error: err.message });
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/rbac/roles                                                       */
/* -------------------------------------------------------------------------- */
async function crearRol(req, res) {
  const { nombre, codigo, descripcion, clonarDe } = req.body || {};
  const nombreLimpio = String(nombre || "").trim();
  const codigoLimpio = String(codigo || "").trim().toLowerCase();

  if (nombreLimpio.length < 3 || nombreLimpio.length > 80) {
    return JsonView.send(res, 400, { error: "El nombre debe tener entre 3 y 80 caracteres." });
  }
  if (!CODIGO_ROL_VALIDO.test(codigoLimpio)) {
    return JsonView.send(res, 400, {
      error: "El código debe iniciar con una letra y usar minúsculas, números o guion bajo.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existentes } = await client.query(
      "SELECT 1 FROM roles WHERE codigo = $1 OR nombre_rol = $2 OR LOWER(nombre_rol) = LOWER($3) LIMIT 1",
      [codigoLimpio, codigoLimpio, nombreLimpio]
    );
    if (existentes.length) {
      await client.query("ROLLBACK");
      return JsonView.send(res, 409, { error: "Ya existe un rol con ese código o nombre." });
    }

    const { rows } = await client.query(
      `INSERT INTO roles (nombre_rol, descripcion, estado, codigo, es_sistema)
       VALUES ($1, $2, 'borrador', $3, FALSE)
       RETURNING id_rol AS "idRol", codigo, nombre_rol AS "nombre",
                 descripcion, estado, version_permisos AS "version"`,
      [nombreLimpio, descripcion ? String(descripcion).slice(0, 200) : null, codigoLimpio]
    );
    const rol = rows[0];

    if (clonarDe) {
      const idOrigen = Number(clonarDe);
      if (Number.isInteger(idOrigen)) {
        await client.query(
          `INSERT INTO permisos_rol (id_rol, id_seccion, puede_ver, puede_acceder, actualizado_por)
           SELECT $1, pr.id_seccion, pr.puede_ver, pr.puede_acceder, $3
             FROM permisos_rol pr
             JOIN secciones s ON s.id_seccion = pr.id_seccion
            WHERE pr.id_rol = $2
              AND s.es_protegida = FALSE
              AND s.codigo NOT LIKE 'configuracion%'
           ON CONFLICT (id_rol, id_seccion) DO NOTHING`,
          [rol.idRol, idOrigen, req.usuario.idUsuario]
        );
      }
    }

    await client.query(
      `INSERT INTO auditoria_permisos (id_actor, id_rol, accion, despues, ip)
       VALUES ($1, $2, 'crear_rol', $3::jsonb, $4)`,
      [req.usuario.idUsuario, rol.idRol, JSON.stringify({ rol, clonarDe: clonarDe || null }), req.ip || null]
    );

    await client.query("COMMIT");
    JsonView.send(res, 201, rol);
  } catch (err) {
    await client.query("ROLLBACK");
    JsonView.send(res, 500, { error: err.message });
  } finally {
    client.release();
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/rbac/roles/:id/estado                                           */
/* -------------------------------------------------------------------------- */
async function cambiarEstadoRol(req, res) {
  const idRol = Number(req.params.id);
  const estado = String(req.body?.estado || "").toLowerCase();

  if (!Number.isInteger(idRol)) {
    return JsonView.send(res, 400, { error: "ID de rol inválido." });
  }
  if (!["activo", "inactivo", "borrador"].includes(estado)) {
    return JsonView.send(res, 400, { error: "Estado inválido." });
  }
  if (idRol === req.usuario.idRol) {
    return JsonView.send(res, 403, { error: "SELF_EDIT_NOT_ALLOWED" });
  }

  const rol = await obtenerRol(idRol);
  if (!rol) return JsonView.send(res, 404, { error: "Rol no encontrado." });
  if (rol.esSistema && estado !== "activo") {
    return JsonView.send(res, 403, { error: "SYSTEM_ROLE" });
  }

  if (estado === "activo") {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM secciones s
        WHERE s.estado = 'activo'
          AND rol_puede($1, s.codigo, 'acceder') = TRUE`,
      [idRol]
    );
    if (!rows[0]?.total) {
      return JsonView.send(res, 422, {
        error: "ROL_SIN_ACCESOS",
        mensaje: "Activa al menos una sección antes de habilitar el rol.",
      });
    }
  } else {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM usuarios
        WHERE id_rol = $1
          AND LOWER(estado) = 'activo'`,
      [idRol]
    );
    if (rows[0]?.total) {
      return JsonView.send(res, 409, {
        error: "ROL_CON_USUARIOS",
        usuarios: rows[0].total,
        mensaje: "Reasigna a los usuarios activos de este rol antes de desactivarlo.",
      });
    }
  }

  await pool.query("UPDATE roles SET estado = $1 WHERE id_rol = $2", [estado, idRol]);

  if (estado === "inactivo") {
    await pool.query(
      `DELETE FROM sesiones
        WHERE id_usuario IN (SELECT id_usuario FROM usuarios WHERE id_rol = $1)`,
      [idRol]
    );
  }

  await pool.query(
    `INSERT INTO auditoria_permisos (id_actor, id_rol, accion, despues, ip)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      req.usuario.idUsuario,
      idRol,
      estado === "activo" ? "activar_rol" : "desactivar_rol",
      JSON.stringify({ estado }),
      req.ip || null,
    ]
  );

  JsonView.send(res, 200, { ok: true, idRol, estado });
}

/* -------------------------------------------------------------------------- */
/* GET /api/rbac/matriz                                                       */
/* -------------------------------------------------------------------------- */
async function obtenerMatriz(req, res) {
  try {
    const data = await getMatriz();
    const roles = data.roles.map((r) => ({ ...r, esPropio: r.idRol === req.usuario.idRol }));
    JsonView.send(res, 200, { ...data, roles });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/rbac/auditoria                                                    */
/* -------------------------------------------------------------------------- */
async function listarAuditoria(req, res) {
  try {
    const idRol = req.query.idRol ? Number(req.query.idRol) : null;
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);

    const { rows } = await pool.query(
      `SELECT a.id_auditoria AS "id",
              a.accion,
              a.antes,
              a.despues,
              a.motivo,
              a.creado_en AS "creadoEn",
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), u.usuario_login, 'Sistema') AS "actor",
              r.nombre_rol AS "rol",
              r.codigo AS "rolCodigo"
         FROM auditoria_permisos a
         LEFT JOIN usuarios u ON u.id_usuario = a.id_actor
         LEFT JOIN roles r ON r.id_rol = a.id_rol
        WHERE ($1::int IS NULL OR a.id_rol = $1)
        ORDER BY a.creado_en DESC
        LIMIT $2`,
      [idRol, limite]
    );

    JsonView.send(res, 200, rows);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
}

module.exports = {
  listarRoles,
  listarSecciones,
  obtenerPermisosRol,
  guardarPermisosRol,
  crearRol,
  cambiarEstadoRol,
  obtenerMatriz,
  listarAuditoria,
};
