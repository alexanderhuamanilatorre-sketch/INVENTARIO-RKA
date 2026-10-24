const DatabaseModel = require("../models/database.model");
const JsonView = require("../views/json.view");
const handlers = {};
handlers['GET /'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query("SELECT * FROM clientes ORDER BY id_cliente");
    JsonView.send(res, 200, rows);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['GET /:id'] = async (req, res) => {
  try {
    const { rows } = await DatabaseModel.query("SELECT * FROM clientes WHERE id_cliente = $1", [req.params.id]);
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['POST /'] = async (req, res) => {
  try {
    const { nombre, contacto, telefono, correo, email, direccion } = req.body;
    const { rows } = await DatabaseModel.query(
      "INSERT INTO clientes (nombre, contacto, telefono, correo, direccion) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [nombre, contacto, telefono, correo || email, direccion]
    );
    JsonView.send(res, 201, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['PUT /:id'] = async (req, res) => {
  try {
    const { nombre, contacto, telefono, correo, email, direccion } = req.body;
    const { rows } = await DatabaseModel.query(
      "UPDATE clientes SET nombre=$1, contacto=$2, telefono=$3, correo=$4, direccion=$5 WHERE id_cliente=$6 RETURNING *",
      [nombre, contacto, telefono, correo || email, direccion, req.params.id]
    );
    if (!rows.length) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, rows[0]);
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

handlers['DELETE /:id'] = async (req, res) => {
  try {
    const { rowCount } = await DatabaseModel.query("DELETE FROM clientes WHERE id_cliente = $1", [req.params.id]);
    if (!rowCount) return JsonView.send(res, 404, { error: "No encontrado" });
    JsonView.send(res, 200, { message: "Cliente eliminado" });
  } catch (err) {
    JsonView.send(res, 500, { error: err.message });
  }
};

module.exports = handlers;
