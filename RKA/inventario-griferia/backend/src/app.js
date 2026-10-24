const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const categoriasRoutes = require("./routes/categorias.routes");
const productosRoutes = require("./routes/productos.routes");
const proveedoresRoutes = require("./routes/proveedores.routes");
const clientesRoutes = require("./routes/clientes.routes");
const movimientosRoutes = require("./routes/movimientos.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const syncRoutes = require("./routes/sync.routes");
const healthRoutes = require("./routes/health.routes");
const rbacRoutes = require("./routes/rbac.routes");
const {
  requireAuth,
  requirePermission,
  requireSameOrigin,
  pageGuard,
} = require("./middleware/auth.middleware");

const app = express();

if (process.env.CORS_ORIGIN) {
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
}

app.use(express.json({ limit: "2mb" }));
app.use(requireSameOrigin);

// Protege las páginas HTML antes de servir archivos estáticos.
app.use(pageGuard);

// Servir el frontend estático (carpeta del proyecto, un nivel arriba de backend)
app.use(express.static(path.join(__dirname, "..", "..")));

// Rutas API
app.use("/api/categorias", requireAuth, requirePermission("productos.categorias"), categoriasRoutes);
app.use("/api/productos", requireAuth, requirePermission("productos"), productosRoutes);
app.use("/api/proveedores", requireAuth, requirePermission("proveedores"), proveedoresRoutes);
app.use("/api/clientes", requireAuth, requirePermission("clientes"), clientesRoutes);
app.use("/api/movimientos", requireAuth, requirePermission("movimientos"), movimientosRoutes);
app.use("/api/usuarios", usuariosRoutes);
app.use("/api/sync", requireAuth, syncRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/rbac", rbacRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "ENDPOINT_NO_ENCONTRADO" });
});

module.exports = app;
