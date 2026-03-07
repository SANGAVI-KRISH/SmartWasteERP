const express = require("express");
const router = express.Router();
const controller = require("../controllers/staffVehicle.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

router.get("/staff", requireAuth, requireRoles("admin"), controller.getAssignableStaff);
router.get("/logs", requireAuth, controller.getLogs);
router.post("/logs", requireAuth, controller.createTripLog);
router.patch("/logs/:id/status", requireAuth, requireRoles("admin"), controller.updateLogStatus);
router.post("/manual-task", requireAuth, requireRoles("admin"), controller.createManualTask);

module.exports = router;