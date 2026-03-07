const express = require("express");
const router = express.Router();
const financeController = require("../controllers/finance.controller");
const { requireAuth } = require("../middleware/auth.middleware"); // adjust path/name if needed

router.get("/summary", requireAuth, financeController.getSummary);
router.get("/transactions", requireAuth, financeController.getTransactions);
router.post("/expense", requireAuth, financeController.createExpense);

router.get("/rates", requireAuth, financeController.getRates);
router.post("/rates", requireAuth, financeController.createRate);
router.put("/rates/:id", requireAuth, financeController.updateRate);

router.delete("/transactions/:id", requireAuth, financeController.deleteTransaction);

module.exports = router;