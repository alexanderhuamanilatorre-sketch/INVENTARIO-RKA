const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const handlers = {};
// Listar movimientos con producto, tipo y motivo
handlers['GET /'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query(`
      SELECT m.*, p.nombre_producto AS producto_nombre,
             t.nombre_tipo AS tipo, mo.nombre_motivo AS motivo
      FROM movimientos m
      LEFT JOIN productos p ON p.id_producto = m.id_producto
      LEFT JOIN tipo_movimiento t ON t.id_tipo_movimiento = m.id_tipo_movimiento
      LEFT JOIN motivo_movimiento mo ON mo.id_motivo = m.id_motivo
      ORDER BY m.fecha_hora DESC
    `);
    JsonView.send(res, 200, rows);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

// Registrar movimiento y actualizar stock (transacción)
handlers['POST /'] = async (req, res) => {
  const client = await DatabaseModel.connect();
  try {
    const { tipo, producto_id, cantidad, motivo, observacion, usuario } = req.body;
    if (!["entrada", "salida"].includes(tipo)) {
      return JsonView.send(res, 400, { error: "Tipo inválido" });
    }
    await client.query("BEGIN");

    // Verificar stock para salida
    if (tipo === "salida") {
      const { rows } = await client.query("SELECT stock_actual FROM productos WHERE id_producto = $1 FOR UPDATE", [producto_id]);
      if (!rows.length) throw new Error("Producto no encontrado");
      if (rows[0].stock_actual < cantidad) throw new Error("Stock insuficiente");
    }

    // Resolver ids de tipo y motivo por nombre
    const tipoRes = await client.query("SELECT id_tipo_movimiento FROM tipo_movimiento WHERE nombre_tipo = $1", [tipo]);
    const idTipo = tipoRes.rows[0]?.id_tipo_movimiento || null;
    let idMotivo = null;
    if (motivo) {
      const motRes = await client.query("SELECT id_motivo FROM motivo_movimiento WHERE nombre_motivo = $1", [motivo]);
      idMotivo = motRes.rows[0]?.id_motivo || null;
    }

    // Resolver usuario por login
    let idUsuario = null;
    if (usuario) {
      const uRes = await client.query("SELECT id_usuario FROM usuarios WHERE usuario_login = $1", [usuario]);
      idUsuario = uRes.rows[0]?.id_usuario || null;
    }

    const { rows: mov } = await client.query(
      "INSERT INTO movimientos (id_tipo_movimiento, id_producto, cantidad, id_motivo, observacion, id_usuario_registro) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [idTipo, producto_id, cantidad, idMotivo, observacion || motivo || "", idUsuario]
    );

    if (tipo === "entrada") {
      await client.query("UPDATE productos SET stock_actual = stock_actual + $1 WHERE id_producto = $2", [cantidad, producto_id]);
    } else {
      await client.query("UPDATE productos SET stock_actual = stock_actual - $1 WHERE id_producto = $2", [cantidad, producto_id]);
    }

    await client.query("COMMIT");
    JsonView.send(res, 201, mov[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    JsonView.send(res, 400, { error: err.message });
  } finally {
    client.release();
  }
};

handlers['DELETE /:id'] = async (req, res) => {
  try {
    const { rowCount } = await DatabaseModel.query("DELETE FROM movimientos WHERE id_movimiento = $1", [req.params.id]);
    if (!rowCount) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, { message: "Movimiento eliminado" });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

module.exports = handlers;
