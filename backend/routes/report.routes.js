const express = require("express");
const router = express.Router();
const controller = require("../controllers/report.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/summary", requireAuth, controller.getReportSummary);

module.exports = router;