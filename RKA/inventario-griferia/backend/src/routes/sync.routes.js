const express = require("express");
const controller = require("../controllers/sync.controller.js");
const router = express.Router();

router.get("/", controller['GET /']);
router.post("/", controller['POST /']);

module.exports = router;
