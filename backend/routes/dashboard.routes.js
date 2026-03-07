const express = require("express");
const router = express.Router();
const controller = require("../controllers/dashboard.controller");

router.get("/summary", controller.getDashboardSummary);

module.exports = router;