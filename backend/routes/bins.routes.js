const express = require("express");
const router = express.Router();
const {
  getBins,
  updateBin,
  assignBinTask
} = require("../controllers/bins.controller");

router.get("/", getBins);
router.put("/", updateBin);
router.post("/assign", assignBinTask);

module.exports = router;