const express = require("express");
const router = express.Router();

const financeController = require("../controllers/finance.controller");
const { requireAuth } = require("../middleware/auth.middleware");

router.get("/summary", requireAuth, financeController.getSummary);

router.get("/transactions", requireAuth, financeController.getTransactions);
router.post("/expense", requireAuth, financeController.createExpense);
router.delete("/transactions/:id", requireAuth, financeController.deleteTransaction);

router.get("/rates", requireAuth, financeController.getRates);
router.post("/rates", requireAuth, financeController.createRate);
router.put("/rates/:id", requireAuth, financeController.updateRate);


module.exports = router;