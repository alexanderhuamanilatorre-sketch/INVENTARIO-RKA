/**
 * Ejecuta la migración RBAC sobre la base configurada en backend/.env.
 *
 * Uso:
 *   npm run migrate:rbac
 */
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function main() {
  const ruta = path.join(__dirname, "..", "..", "..", "database", "migration_rbac.sql");
  const sql = fs.readFileSync(ruta, "utf8");

  console.log("Ejecutando migración RBAC...");
  await pool.query(sql);
  console.log("Migración RBAC completada correctamente.");
}

main()
  .catch((err) => {
    console.error("Error al ejecutar la migración RBAC:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
