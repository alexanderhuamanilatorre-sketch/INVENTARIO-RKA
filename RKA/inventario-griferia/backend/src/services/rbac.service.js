const pool = require("../config/db");

/**
 * Devuelve todas las secciones activas con el permiso efectivo del rol.
 * El permiso efectivo ya considera la herencia de ancestros.
 */
async function getPermisosEfectivos(idRol) {
  if (!idRol) return [];
  const { rows } = await pool.query(
    `SELECT s.id_seccion AS "idSeccion",
            s.codigo,
            s.nombre,
            s.id_padre AS "idPadre",
            s.ruta,
            s.icono,
            s.orden,
            s.tipo,
            s.es_contenedor AS "esContenedor",
            s.es_protegida AS "esProtegida",
            s.es_inicio AS "esInicio",
            rol_puede($1, s.codigo, 'ver') AS "puedeVer",
            rol_puede($1, s.codigo, 'acceder') AS "puedeAcceder"
       FROM secciones s
      WHERE s.estado = 'activo'
      ORDER BY s.orden, s.id_seccion`,
    [idRol]
  );
  return rows;
}

async function tienePermiso(idRol, codigo, campo = "acceder") {
  if (!idRol) return false;
  const { rows } = await pool.query(
    "SELECT rol_puede($1, $2, $3) AS permitido",
    [idRol, codigo, campo]
  );
  return Boolean(rows[0]?.permitido);
}

async function getInicio(idRol) {
  const permisos = await getPermisosEfectivos(idRol);
  const accesibles = permisos.filter((p) => p.puedeAcceder);
  const inicio = accesibles.find((p) => p.esInicio) || accesibles.find((p) => !p.idPadre);
  return inicio || null;
}

async function getArbolSecciones() {
  const { rows } = await pool.query(
    `SELECT id_seccion AS "idSeccion",
            codigo,
            nombre,
            id_padre AS "idPadre",
            ruta,
            icono,
            orden,
            tipo,
            es_contenedor AS "esContenedor",
            es_protegida AS "esProtegida",
            es_inicio AS "esInicio",
            estado
       FROM secciones
      WHERE estado = 'activo'
      ORDER BY orden, id_seccion`
  );

  const byId = new Map(rows.map((row) => [row.idSeccion, { ...row, hijos: [] }]));
  const roots = [];
  for (const row of byId.values()) {
    if (row.idPadre && byId.has(row.idPadre)) byId.get(row.idPadre).hijos.push(row);
    else roots.push(row);
  }
  return roots;
}

async function getSeccionesPlanas() {
  const { rows } = await pool.query(
    `SELECT id_seccion AS "idSeccion",
            codigo,
            nombre,
            id_padre AS "idPadre",
            ruta,
            icono,
            orden,
            tipo,
            es_contenedor AS "esContenedor",
            es_protegida AS "esProtegida",
            es_inicio AS "esInicio"
       FROM secciones
      WHERE estado = 'activo'
      ORDER BY orden, id_seccion`
  );
  return rows;
}

async function getRoles({ excluirRol } = {}) {
  const { rows } = await pool.query(
    `SELECT r.id_rol AS "idRol",
            r.codigo,
            r.nombre_rol AS "nombre",
            r.descripcion,
            r.estado,
            r.es_sistema AS "esSistema",
            r.version_permisos AS "version",
            r.actualizado_en AS "actualizadoEn",
            COUNT(u.id_usuario) FILTER (WHERE u.estado = 'activo') AS "usuariosActivos",
            COUNT(u.id_usuario) AS "usuariosTotales"
       FROM roles r
       LEFT JOIN usuarios u ON u.id_rol = r.id_rol
      GROUP BY r.id_rol
      ORDER BY r.es_sistema DESC, r.nombre_rol`,
    []
  );

  return rows.map((row) => ({
    ...row,
    usuariosActivos: Number(row.usuariosActivos) || 0,
    usuariosTotales: Number(row.usuariosTotales) || 0,
    esPropio: excluirRol ? row.idRol === excluirRol : false,
  }));
}

async function getMatriz() {
  const roles = await getRoles();
  const secciones = await getSeccionesPlanas();
  const matriz = await pool.query(
    `SELECT id_rol AS "idRol", id_seccion AS "idSeccion",
            puede_ver AS "puedeVer", puede_acceder AS "puedeAcceder"
       FROM permisos_rol`
  );

  const mapa = new Map();
  for (const row of matriz.rows) {
    mapa.set(`${row.idRol}:${row.idSeccion}`, row);
  }

  return {
    roles,
    secciones,
    permisos: matriz.rows,
    mapa: Object.fromEntries(mapa),
  };
}

module.exports = {
  getPermisosEfectivos,
  tienePermiso,
  getInicio,
  getArbolSecciones,
  getSeccionesPlanas,
  getRoles,
  getMatriz,
};
