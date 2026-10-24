/**
 * Ejecuta la migración de recuperación de contraseña sobre la base configurada
 * en backend/.env y rellena la contraseña visible de las cuentas existentes
 * cuando coincide con el formato generado por el sistema.
 *
 * Uso:
 *   npm run migrate:passwords
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { verifyPassword } = require("../lib/passwords");
const { cifrarCredencial } = require("../lib/credentials");

function generarContrasena(row) {
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

async function rellenarCredencialesVisibles() {
  const { rows } = await pool.query(
    `SELECT id_usuario, nombres, apellidos, contrasena
       FROM usuarios
      WHERE contrasena_visible IS NULL`
  );

  let actualizados = 0;
  for (const row of rows) {
    const candidata = generarContrasena(row);
    const verificacion = await verifyPassword(candidata, row.contrasena || "");
    if (!verificacion.ok) continue;
    await pool.query(
      "UPDATE usuarios SET contrasena_visible = $1 WHERE id_usuario = $2",
      [cifrarCredencial(candidata), row.id_usuario]
    );
    actualizados += 1;
  }

  console.log(`Contraseñas visibles completadas: ${actualizados} de ${rows.length}.`);
}

async function main() {
  const ruta = path.join(__dirname, "..", "..", "..", "database", "migration_passwords.sql");
  const sql = fs.readFileSync(ruta, "utf8");

  console.log("Ejecutando migración de contraseñas...");
  await pool.query(sql);
  await rellenarCredencialesVisibles();
  console.log("Migración de contraseñas completada correctamente.");
}

main()
  .catch((err) => {
    console.error("Error al ejecutar la migración de contraseñas:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
