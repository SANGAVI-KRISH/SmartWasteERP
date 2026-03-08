const express = require("express");
const router = express.Router();

const controller = require("../controllers/map.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/full-bins", requireAuth, controller.getFullBinsForMap);

module.exports = router;