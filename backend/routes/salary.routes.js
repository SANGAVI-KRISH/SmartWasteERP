const express = require("express");
const router = express.Router();
const controller = require("../controllers/salary.controller");
const { requireAuth } = require("../middleware/auth.middleware");

// get salary for logged-in user
router.get("/my", requireAuth, controller.getMySalary);

module.exports = router;