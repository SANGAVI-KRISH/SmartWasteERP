const express = require("express");
const router = express.Router();

const reportController = require("../controllers/report.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/summary", requireAuth, reportController.getReportSummary);

router.get("/export", requireAuth, reportController.exportReportCSV);

module.exports = router;