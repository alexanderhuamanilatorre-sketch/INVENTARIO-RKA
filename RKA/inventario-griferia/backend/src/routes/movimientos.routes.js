const express = require("express");
const controller = require("../controllers/movimientos.controller.js");
const router = express.Router();

router.get("/", controller['GET /']);
router.post("/", controller['POST /']);
router.delete("/:id", controller['DELETE /:id']);

module.exports = router;
