const JsonView = require("../views/json.view");

function getHealth(req, res) {
  JsonView.send(res, 200, { status: "ok", service: "RKA API" });
}

module.exports = { getHealth };
