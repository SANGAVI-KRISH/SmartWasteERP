const financeService = require("../services/finance.service");

/**
 * Optional helper:
 * adjust this if your auth middleware stores user differently
 */
function getUser(req) {
  return req.user || req.authUser || req.profile || null;
}

function isAdmin(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

/**
 * GET /api/finance/summary
 */
exports.getSummary = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can view finance summary" });
    }

    const result = await financeService.getSummary();
    return res.status(200).json(result);
  } catch (err) {
    console.error("finance.getSummary error:", err.message);
    return res.status(500).json({
      message: "Failed to fetch finance summary",
      error: err.message
    });
  }
};

/**
 * GET /api/finance/transactions?q=&type=&category=
 */
exports.getTransactions = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can view finance transactions" });
    }

    const filters = {
      q: req.query.q || "",
      type: req.query.type || "",
      category: req.query.category || "",
      from: req.query.from || "",
      to: req.query.to || ""
    };

    const rows = await financeService.getTransactions(filters);
    return res.status(200).json(rows);
  } catch (err) {
    console.error("finance.getTransactions error:", err.message);
    return res.status(500).json({
      message: "Failed to fetch finance transactions",
      error: err.message
    });
  }
};

/**
 * POST /api/finance/expense
 * body: { txn_date, category, amount, description }
 */
exports.createExpense = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can create expense entries" });
    }

    const { txn_date, category, amount, description } = req.body || {};

    if (!txn_date) {
      return res.status(400).json({ message: "txn_date is required" });
    }

    if (!category || !String(category).trim()) {
      return res.status(400).json({ message: "category is required" });
    }

    if (amount === undefined || amount === null || Number(amount) <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const payload = {
      txn_date,
      category: String(category).trim(),
      amount: Number(amount),
      description: String(description || "").trim()
    };

    const created = await financeService.createExpense(payload, user);

    return res.status(201).json({
      message: "Expense created successfully",
      data: created
    });
  } catch (err) {
    console.error("finance.createExpense error:", err.message);
    return res.status(500).json({
      message: "Failed to create expense",
      error: err.message
    });
  }
};

/**
 * GET /api/finance/rates?rate_type=&waste_type=
 */
exports.getRates = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters = {
      rate_type: req.query.rate_type || "",
      waste_type: req.query.waste_type || ""
    };

    const rows = await financeService.getRates(filters);
    return res.status(200).json(rows);
  } catch (err) {
    console.error("finance.getRates error:", err.message);
    return res.status(500).json({
      message: "Failed to fetch finance rates",
      error: err.message
    });
  }
};

/**
 * POST /api/finance/rates
 * body: { waste_type, rate_per_kg, rate_type }
 */
exports.createRate = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can create finance rates" });
    }

    const { waste_type, rate_per_kg, rate_type } = req.body || {};

    const allowedWasteTypes = ["Wet", "Dry", "Plastic"];
    const allowedRateTypes = ["collection", "recycling"];

    if (!allowedWasteTypes.includes(waste_type)) {
      return res.status(400).json({
        message: "waste_type must be one of: Wet, Dry, Plastic"
      });
    }

    if (!allowedRateTypes.includes(rate_type)) {
      return res.status(400).json({
        message: "rate_type must be one of: collection, recycling"
      });
    }

    if (rate_per_kg === undefined || rate_per_kg === null || Number(rate_per_kg) < 0) {
      return res.status(400).json({
        message: "rate_per_kg must be 0 or greater"
      });
    }

    const payload = {
      waste_type,
      rate_type,
      rate_per_kg: Number(rate_per_kg)
    };

    const created = await financeService.createRate(payload, user);

    return res.status(201).json({
      message: "Finance rate created successfully",
      data: created
    });
  } catch (err) {
    console.error("finance.createRate error:", err.message);
    return res.status(500).json({
      message: "Failed to create finance rate",
      error: err.message
    });
  }
};

/**
 * PUT /api/finance/rates/:id
 * body: { rate_per_kg }
 */
exports.updateRate = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can update finance rates" });
    }

    const { id } = req.params;
    const { rate_per_kg } = req.body || {};

    if (!id) {
      return res.status(400).json({ message: "Rate id is required" });
    }

    if (rate_per_kg === undefined || rate_per_kg === null || Number(rate_per_kg) < 0) {
      return res.status(400).json({
        message: "rate_per_kg must be 0 or greater"
      });
    }

    const updated = await financeService.updateRate(id, Number(rate_per_kg));

    return res.status(200).json({
      message: "Finance rate updated successfully",
      data: updated
    });
  } catch (err) {
    console.error("finance.updateRate error:", err.message);
    return res.status(500).json({
      message: "Failed to update finance rate",
      error: err.message
    });
  }
};

/**
 * DELETE /api/finance/transactions/:id
 * Optional: useful only for admin corrections
 */
exports.deleteTransaction = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdmin(user)) {
      return res.status(403).json({ message: "Only admin can delete finance transactions" });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Transaction id is required" });
    }

    await financeService.deleteTransaction(id);

    return res.status(200).json({
      message: "Finance transaction deleted successfully"
    });
  } catch (err) {
    console.error("finance.deleteTransaction error:", err.message);
    return res.status(500).json({
      message: "Failed to delete finance transaction",
      error: err.message
    });
  }
};