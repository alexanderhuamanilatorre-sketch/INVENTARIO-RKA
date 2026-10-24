const express = require("express");
const controller = require("../controllers/rbac.controller");
const { requireAuth, requirePermission } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission("configuracion.permisos", "acceder"));

router.get("/roles", controller.listarRoles);
router.post("/roles", controller.crearRol);
router.patch("/roles/:id/estado", controller.cambiarEstadoRol);
router.get("/roles/:id/permisos", controller.obtenerPermisosRol);
router.put("/roles/:id/permisos", controller.guardarPermisosRol);
router.get("/secciones", controller.listarSecciones);
router.get("/matriz", controller.obtenerMatriz);
router.get("/auditoria", controller.listarAuditoria);

module.exports = router;
