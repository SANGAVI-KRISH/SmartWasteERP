const express = require("express");
const router = express.Router();

const controller = require("../controllers/tasks.controller");
const { requireAuth } = require("../middleware/auth.middleware");

/* ---------------- GET TASKS ---------------- */

router.get(
  "/",
  requireAuth,
  controller.getMyTasks
);

/* ---------------- PICKUP TASK STATUS ---------------- */

router.patch(
  "/pickup/:id/status",
  requireAuth,
  controller.updatePickupTaskStatus
);

/* ---------------- TRIP / STAFF TASK STATUS ---------------- */

router.patch(
  "/trip/:id/status",
  requireAuth,
  controller.updateTripTaskStatus
);

/* ---------------- COMPLETE STAFF TASK + SAVE COLLECTION ---------------- */

router.post(
  "/staff-task/:id/complete",
  requireAuth,
  controller.completeStaffTaskWithCollection
);

module.exports = router;