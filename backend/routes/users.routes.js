const express = require("express");
const router = express.Router();
const controller = require("../controllers/users.controller");
const { requireAuth, requireRoles } = require("../middleware/auth.middleware");

router.get("/", requireAuth, requireRoles("admin"), controller.getUsers);
router.patch("/:id", requireAuth, requireRoles("admin"), controller.updateUser);

module.exports = router;