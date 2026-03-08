const express = require("express");
const router = express.Router();

const controller = require("../controllers/staffVehicle.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

/* ------------------------------
   Staff list for admin assignment
------------------------------ */
router.get(
  "/staff",
  requireAuth,
  requireRoles("admin"),
  controller.getAssignableStaff
);

/* ------------------------------
   Activity logs
   - get logs
   - create trip log
------------------------------ */
router.get(
  "/logs",
  requireAuth,
  controller.getLogs
);

router.post(
  "/logs",
  requireAuth,
  controller.createTripLog
);

/* ------------------------------
   Update log status
   keep this route because:
   - backend may still need it
   - future UI may use it
   - completed rows are filtered out in controller/service
------------------------------ */
router.patch(
  "/logs/:id/status",
  requireAuth,
  requireRoles("admin"),
  controller.updateLogStatus
);

/* ------------------------------
   Admin manual task creation
------------------------------ */
router.post(
  "/manual-task",
  requireAuth,
  requireRoles("admin"),
  controller.createManualTask
);

module.exports = router;