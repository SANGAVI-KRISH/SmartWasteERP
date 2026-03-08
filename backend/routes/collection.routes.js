const express = require("express");
const router = express.Router();
const controller = require("../controllers/collection.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/", requireAuth, controller.getCollections);
router.get("/task-prefill", requireAuth, controller.getTaskPrefill);
router.get("/staff-task-prefill", requireAuth, controller.getStaffTaskPrefill);
router.post("/", requireAuth, controller.createCollection);
router.delete("/:id", requireAuth, controller.deleteCollection);

module.exports = router;