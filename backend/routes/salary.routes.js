const express = require("express");
const router = express.Router();

const salaryController = require("../controllers/salary.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/my", requireAuth, salaryController.getMySalary);

router.get("/my-history", requireAuth, salaryController.getMySalaryHistory);

router.get("/export-pdf", requireAuth, salaryController.exportMySalaryPdf);

module.exports = router;