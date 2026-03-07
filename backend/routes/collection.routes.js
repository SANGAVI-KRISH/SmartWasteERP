const express = require("express");
const router = express.Router();
const controller = require("../controllers/collection.controller");

router.get("/", controller.getCollections);
router.get("/task-prefill", controller.getTaskPrefill);
router.get("/staff-task-prefill", controller.getStaffTaskPrefill);
router.post("/", controller.createCollection);
router.delete("/:id", controller.deleteCollection);

module.exports = router;