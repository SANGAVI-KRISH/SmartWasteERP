const express = require("express");
const router = express.Router();
const controller = require("../controllers/profile.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/me", requireAuth, controller.getMyProfile);
router.patch("/password", requireAuth, controller.changeMyPassword);

module.exports = router;