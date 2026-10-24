/**
 * Ejecuta la migración de numeración de ventas sobre la base configurada en
 * backend/.env.
 *
 * Uso:
 *   npm run migrate:ventas
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function main() {
  const ruta = path.join(__dirname, "..", "..", "..", "database", "migration_ventas.sql");
  const sql = fs.readFileSync(ruta, "utf8");

  console.log("Ejecutando migración de ventas...");
  await pool.query(sql);
  console.log("Migración de ventas completada correctamente.");
}

main()
  .catch((err) => {
    console.error("Error al ejecutar la migración de ventas:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
