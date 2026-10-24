const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const handlers = {};
// Listar categorías
handlers['GET /'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query("SELECT * FROM categorias ORDER BY id_categoria");
    JsonView.send(res, 200, rows);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

// Obtener categoría por id
handlers['GET /:id'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query("SELECT * FROM categorias WHERE id_categoria = $1", [req.params.id]);
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

// Crear categoría
handlers['POST /'] = async (req, res) => {
  try {
    const { nombre_categoria, descripcion, nombre } = req.body;
    const { rows } = await DatabaseModel.query(
      "INSERT INTO categorias (nombre_categoria, descripcion) VALUES ($1,$2) RETURNING *",
      [nombre_categoria || nombre, descripcion || ""]
    );
    JsonView.send(res, 201, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

// Actualizar categoría
handlers['PATCH /:id'] = async (req, res) => {
  try {
    const { nombre_categoria, descripcion } = req.body;
    const { rows } = await DatabaseModel.query(
      "UPDATE categorias SET nombre_categoria = COALESCE($1, nombre_categoria), descripcion = COALESCE($2, descripcion) WHERE id_categoria = $3 RETURNING *",
      [nombre_categoria, descripcion, req.params.id]
    );
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['DELETE /:id'] = async (req, res) => {
  try {
    const { rowCount } = await DatabaseModel.query("DELETE FROM categorias WHERE id_categoria = $1", [req.params.id]);
    if (!rowCount) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, { ok: true });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

module.exports = handlers;
