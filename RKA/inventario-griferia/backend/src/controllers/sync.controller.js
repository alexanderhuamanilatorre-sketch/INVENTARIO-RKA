const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const { tienePermiso } = require("../services/rbac.service");
const handlers = {};

// La columna fecha_hora es TIMESTAMP sin zona horaria. Si le enviamos un
// ISO con "Z", PostgreSQL ignora la zona y guarda la hora UTC como si fuera
// local, desplazando la fecha en cada guardado. Convertimos el instante a la
// hora local del servidor para que el ida y vuelta sea estable.
function toLocalTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const valida = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  return (
    `${valida.getFullYear()}-${pad(valida.getMonth() + 1)}-${pad(valida.getDate())} ` +
    `${pad(valida.getHours())}:${pad(valida.getMinutes())}:${pad(valida.getSeconds())}.${pad(valida.getMilliseconds(), 3)}`
  );
}
// Devuelve los datos en el mismo formato que usa el frontend (appData),
// para que la página pueda cargarse desde la base de datos.
handlers['GET /'] = async (req, res) => {
  try {
    const idRol = req.usuario?.idRol;
    const [verProductos, verCategorias, verProveedores, verClientes, verMovimientos] =
      await Promise.all([
        tienePermiso(idRol, "productos", "acceder"),
        tienePermiso(idRol, "productos.categorias", "acceder"),
        tienePermiso(idRol, "proveedores", "acceder"),
        tienePermiso(idRol, "clientes", "acceder"),
        tienePermiso(idRol, "movimientos", "acceder"),
      ]);

    const vacio = Promise.resolve({ rows: [] });
    const cats = verCategorias
      ? DatabaseModel.query("SELECT id_categoria AS id, nombre_categoria AS nombre, descripcion FROM categorias ORDER BY id_categoria")
      : vacio;
    const provs = verProveedores
      ? DatabaseModel.query("SELECT id_proveedor AS id, nombre_proveedor AS nombre, contacto, ruc, telefono, correo AS email, direccion FROM proveedores ORDER BY id_proveedor")
      : vacio;
    const prods = verProductos
      ? DatabaseModel.query(`
      SELECT p.id_producto AS id, p.codigo_producto AS codigo, p.nombre_producto AS nombre,
             p.descripcion, p.id_categoria AS "categoriaId", p.id_proveedor AS "proveedorId",
             p.stock_actual AS stock, p.stock_minimo AS "stockMinimo", p.precio_venta AS precio
      FROM productos p ORDER BY p.id_producto`)
      : vacio;
    const clis = verClientes
      ? DatabaseModel.query("SELECT id_cliente AS id, nombre, contacto, telefono, correo AS email, direccion FROM clientes ORDER BY id_cliente")
      : vacio;
    const movs = verMovimientos
      ? DatabaseModel.query(`
      SELECT m.id_movimiento AS id, m.numero_venta AS "numeroVenta",
             m.fecha_hora AS fecha, t.nombre_tipo AS tipo,
             m.id_producto AS "productoId", m.cantidad, mo.nombre_motivo AS motivo,
             COALESCE(u.nombres, 'Admin') AS usuario
      FROM movimientos m
      LEFT JOIN tipo_movimiento t ON t.id_tipo_movimiento = m.id_tipo_movimiento
      LEFT JOIN motivo_movimiento mo ON mo.id_motivo = m.id_motivo
      LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario_registro
      ORDER BY m.fecha_hora DESC`)
      : vacio;

    // Normalizar ids a string y campos a tipos del frontend
    const norm = (rows, idFields) => (rows || []).map((r) => {
      const o = { ...r };
      for (const f of idFields) if (o[f] != null) o[f] = String(o[f]);
      return o;
    });

    const [prodRows, catRows, provRows, cliRows, movRows] = await Promise.all([
      prods,
      cats,
      provs,
      clis,
      movs,
    ]);

    JsonView.send(res, 200, {
      productos: norm(prodRows.rows, ["id", "categoriaId", "proveedorId"]),
      categorias: norm(catRows.rows, ["id"]),
      proveedores: norm(provRows.rows, ["id"]),
      clientes: norm(cliRows.rows, ["id"]),
      movimientos: norm(movRows.rows, ["id", "productoId"]),
      configuracion: {},
    });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

// Sincroniza (reemplaza) los datos enviados por el frontend en PostgreSQL.
handlers['POST /'] = async (req, res) => {
  const puedeEditar = await tienePermiso(req.usuario?.idRol, "productos", "acceder");
  if (!puedeEditar) {
    return JsonView.send(res, 403, {
      error: "FORBIDDEN",
      mensaje: "No tienes permiso para sincronizar los datos maestros.",
    });
  }
  const puedeClientes = await tienePermiso(req.usuario?.idRol, "clientes", "acceder");

  const client = await DatabaseModel.connect();
  try {
    const { categorias = [], proveedores = [], productos = [], clientes = [], movimientos = [] } = req.body || {};

    await client.query("BEGIN");
    const tablas = ["movimientos", "producto_proveedor", "productos", "proveedores", "categorias"];
    if (puedeClientes) tablas.push("clientes");
    await client.query(
      `TRUNCATE ${tablas.join(", ")} RESTART IDENTITY CASCADE`
    );

    // 1) Categorías
    const mapCat = {};
    for (const c of categorias) {
      const r = await client.query(
        "INSERT INTO categorias (nombre_categoria, descripcion) VALUES ($1,$2) RETURNING id_categoria",
        [c.nombre || c.nombre_categoria || "", c.descripcion || ""]
      );
      mapCat[c.id] = r.rows[0].id_categoria;
    }

    // 2) Proveedores
    const mapProv = {};
    for (const p of proveedores) {
      const r = await client.query(
        "INSERT INTO proveedores (nombre_proveedor, contacto, ruc, telefono, correo, direccion) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_proveedor",
        [p.nombre || p.nombre_proveedor || "", p.contacto || "", p.ruc || "", p.telefono || "", p.email || p.correo || "", p.direccion || ""]
      );
      mapProv[p.id] = r.rows[0].id_proveedor;
    }

    // 3) Clientes (solo si el rol puede gestionarlos; si no, se conservan)
    if (puedeClientes) {
      for (const c of clientes) {
        await client.query(
          "INSERT INTO clientes (nombre, contacto, telefono, correo, direccion) VALUES ($1,$2,$3,$4,$5)",
          [c.nombre || "", c.contacto || "", c.telefono || "", c.email || c.correo || "", c.direccion || ""]
        );
      }
    }

    // 4) Productos
    const mapProd = {};
    for (const p of productos) {
      const catId = mapCat[p.categoriaId] || null;
      const provId = mapProv[p.proveedorId] || null;
      const r = await client.query(
        "INSERT INTO productos (codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_venta, precio_compra, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_producto",
        [p.codigo || p.codigo_producto || "", p.nombre || p.nombre_producto || "", p.descripcion || "", catId, provId, p.stock ?? p.stock_actual ?? 0, p.stockMinimo ?? p.stock_minimo ?? 5, p.precio ?? p.precio_venta ?? 0, p.precio_compra ?? 0, p.estado || "activo"]
      );
      mapProd[p.id] = r.rows[0].id_producto;
    }

    // 4b) Relación producto <-> proveedor (el TRUNCATE la vacía y no se
    //     reconstruía, por lo que quedaba en 0 tras cada guardado)
    for (const p of productos) {
      const prodId = mapProd[p.id];
      const provId = mapProv[p.proveedorId];
      if (prodId && provId) {
        await client.query(
          "INSERT INTO producto_proveedor (id_producto, id_proveedor) VALUES ($1,$2)",
          [prodId, provId]
        );
      }
    }

    // 5) Movimientos
    for (const m of movimientos) {
      const prodId = mapProd[m.productoId] || mapProd[m.id_producto] || null;
      if (!prodId) continue;

      const tipoRes = await client.query("SELECT id_tipo_movimiento FROM tipo_movimiento WHERE nombre_tipo = $1", [m.tipo || "salida"]);
      const idTipo = tipoRes.rows[0]?.id_tipo_movimiento || null;

      let idMotivo = null;
      if (m.motivo) {
        const motRes = await client.query("SELECT id_motivo FROM motivo_movimiento WHERE nombre_motivo = $1", [m.motivo]);
        idMotivo = motRes.rows[0]?.id_motivo || null;
      }

      let idUsuario = null;
      if (m.usuario) {
        const uRes = await client.query("SELECT id_usuario FROM usuarios WHERE LOWER(usuario_login) = LOWER($1) OR LOWER(nombres) = LOWER($1) LIMIT 1", [m.usuario]);
        idUsuario = uRes.rows[0]?.id_usuario || null;
      }

      await client.query(
        "INSERT INTO movimientos (fecha_hora, id_tipo_movimiento, id_producto, cantidad, id_motivo, observacion, id_usuario_registro, numero_venta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          toLocalTimestamp(m.fecha || m.fecha_hora),
          idTipo,
          prodId,
          m.cantidad ?? 0,
          idMotivo,
          m.observacion || m.motivo || "",
          idUsuario,
          m.numeroVenta ?? null,
        ]
      );
    }

    await client.query("COMMIT");
    JsonView.send(res, 200, { ok: true, message: "Datos sincronizados con PostgreSQL" });
  } catch (err) {
    await client.query("ROLLBACK");
    JsonView.send(res, 500, { error: err.message });
  } finally {
    client.release();
  }
};

module.exports = handlers;
