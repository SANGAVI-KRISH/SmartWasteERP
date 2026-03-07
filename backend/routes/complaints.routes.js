const express = require("express");
const router = express.Router();
const controller = require("../controllers/complaints.controller");

router.get("/", controller.getComplaints);
router.post("/", controller.createComplaint);
router.patch("/:id/status", controller.updateComplaintStatus);

module.exports = router;