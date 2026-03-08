const express = require("express");
const router = express.Router();
const controller = require("../controllers/recycling.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

router.get("/", requireAuth, controller.getRecyclingRecords);
router.get(
  "/available-sources",
  requireAuth,
  requireRoles("admin", "recycling_manager"),
  controller.getAvailableSources
);
router.post(
  "/",
  requireAuth,
  requireRoles("admin", "recycling_manager"),
  controller.createRecyclingRecord
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin", "recycling_manager"),
  controller.deleteRecyclingRecord
);

module.exports = router;