const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const handlers = {};
// Listar productos con categoría y proveedor
handlers['GET /'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query(`
      SELECT p.*, c.nombre_categoria AS categoria_nombre, pr.nombre_proveedor AS proveedor_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
      LEFT JOIN proveedores pr ON pr.id_proveedor = p.id_proveedor
      ORDER BY p.id_producto
    `);
    JsonView.send(res, 200, rows);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['GET /:id'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query("SELECT * FROM productos WHERE id_producto = $1", [req.params.id]);
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['POST /'] = async (req, res) => {
  try {
    const { codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_compra, precio_venta, estado } = req.body;
    const { rows } = await DatabaseModel.query(
      `INSERT INTO productos (codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_compra, precio_venta, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual ?? 0, stock_minimo ?? 5, precio_compra ?? 0, precio_venta ?? 0, estado || 'activo']
    );
    JsonView.send(res, 201, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['PUT /:id'] = async (req, res) => {
  try {
    const { codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_compra, precio_venta, estado } = req.body;
    const { rows } = await DatabaseModel.query(
      `UPDATE productos SET codigo_producto=$1, nombre_producto=$2, descripcion=$3, id_categoria=$4, id_proveedor=$5,
       stock_actual=$6, stock_minimo=$7, precio_compra=$8, precio_venta=$9, estado=$10 WHERE id_producto=$11 RETURNING *`,
      [codigo_producto, nombre_producto, descripcion, id_categoria, id_proveedor, stock_actual, stock_minimo, precio_compra, precio_venta, estado, req.params.id]
    );
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['DELETE /:id'] = async (req, res) => {
  try {
    const { rowCount } = await DatabaseModel.query("DELETE FROM productos WHERE id_producto = $1", [req.params.id]);
    if (!rowCount) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, { message: "Producto eliminado" });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

module.exports = handlers;
