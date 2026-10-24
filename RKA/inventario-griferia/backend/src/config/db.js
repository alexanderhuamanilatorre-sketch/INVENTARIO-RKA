const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD is required. Configure it in backend/.env.");
}

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "rkal_inventario",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

pool.on("error", (err) => {
  console.error("Error inesperado en el pool de PostgreSQL:", err);
});

module.exports = pool;
