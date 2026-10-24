const express = require("express");
const controller = require("../controllers/usuarios.controller.js");
const { requireAuth, requirePermission } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", controller["POST /login"]);
router.post("/logout", controller["POST /logout"]);

// Recuperación pública: no requiere sesión.
router.post("/recuperacion/iniciar", controller["POST /recuperacion/iniciar"]);
router.post("/recuperacion/verificar", controller["POST /recuperacion/verificar"]);
router.post("/recuperacion/restablecer", controller["POST /recuperacion/restablecer"]);

router.get("/me", requireAuth, controller["GET /me"]);

// Gestión de usuarios: solo quien puede administrar usuarios y roles.
const gestionUsuarios = requirePermission("configuracion.usuarios", "acceder");

router.get("/", requireAuth, gestionUsuarios, controller["GET /"]);
router.get("/:id", requireAuth, gestionUsuarios, controller["GET /:id"]);
router.post("/", requireAuth, gestionUsuarios, controller["POST /"]);
router.post("/:id/restablecer", requireAuth, gestionUsuarios, controller["POST /:id/restablecer"]);
router.put("/:id", requireAuth, gestionUsuarios, controller["PUT /:id"]);
router.delete("/:id", requireAuth, gestionUsuarios, controller["DELETE /:id"]);

module.exports = router;
