const express = require("express");
const router = express.Router();
const controller = require("../controllers/map.controller");

router.get("/full-bins", controller.getFullBinsForMap);

module.exports = router;