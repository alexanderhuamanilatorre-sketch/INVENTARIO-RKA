const express = require("express");
const controller = require("../controllers/categorias.controller.js");
const router = express.Router();

router.get("/", controller['GET /']);
router.get("/:id", controller['GET /:id']);
router.post("/", controller['POST /']);
router.patch("/:id", controller['PATCH /:id']);
router.delete("/:id", controller['DELETE /:id']);

module.exports = router;
