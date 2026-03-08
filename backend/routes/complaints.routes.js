const express = require("express");
const router = express.Router();
const controller = require("../controllers/complaints.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/", controller.getComplaints);
router.post("/", requireAuth, controller.createComplaint);
router.patch("/:id/status", requireAuth, controller.updateComplaintStatus);

/* NEW */
router.delete("/:id", requireAuth, controller.deleteComplaint);

module.exports = router;