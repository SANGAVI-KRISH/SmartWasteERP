const express = require("express");
const router = express.Router();
const controller = require("../controllers/tasks.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/", requireAuth, controller.getMyTasks);
router.patch("/pickup/:id/status", requireAuth, controller.updatePickupTaskStatus);
router.patch("/trip/:id/status", requireAuth, controller.updateTripTaskStatus);

module.exports = router;