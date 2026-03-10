const financeService = require("../services/finance.service");

function getUser(req) {
  return req.user || req.authUser || req.profile || null;
}

function isAdmin(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

function fail(res, status, message, error = null) {
  return res.status(status).json({
    ok: false,
    message,
    ...(error ? { error } : {})
  });
}

function ok(res, status, message, data = null) {
  return res.status(status).json({
    ok: true,
    message,
    ...(data !== null ? { data } : {})
  });
}

/**
 * GET /api/finance/summary
 */
exports.getSummary = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can view finance summary");
    }

    const result = await financeService.getSummary();

    return ok(res, 200, "Finance summary fetched successfully", result);
  } catch (err) {
    console.error("finance.getSummary error:", err.message);
    return fail(res, 500, "Failed to fetch finance summary", err.message);
  }
};

/**
 * GET /api/finance/transactions?q=&type=&category=&from=&to=
 */
exports.getTransactions = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can view finance transactions");
    }

    const filters = {
      q: req.query.q || "",
      type: req.query.type || "",
      category: req.query.category || "",
      from: req.query.from || "",
      to: req.query.to || ""
    };

    const rows = await financeService.getTransactions(filters);

    return ok(res, 200, "Finance transactions fetched successfully", rows);
  } catch (err) {
    console.error("finance.getTransactions error:", err.message);
    return fail(res, 500, "Failed to fetch finance transactions", err.message);
  }
};

/**
 * POST /api/finance/expense
 * body:
 * {
 *   txn_date,
 *   category,
 *   amount,
 *   description,
 *   staff_id,
 *   salary_month,
 *   salary_year,
 *   total_kg,
 *   rate
 * }
 */
exports.createExpense = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can create expense entries");
    }

    const {
      txn_date,
      category,
      amount,
      description,
      staff_id,
      salary_month,
      salary_year,
      total_kg,
      rate
    } = req.body || {};

    if (!txn_date) {
      return fail(res, 400, "txn_date is required");
    }

    if (!category || !String(category).trim()) {
      return fail(res, 400, "category is required");
    }

    if (amount === undefined || amount === null || Number(amount) <= 0) {
      return fail(res, 400, "amount must be greater than 0");
    }

    const cleanCategory = String(category).trim().toLowerCase();

    if (cleanCategory === "salary") {
      if (!staff_id || !String(staff_id).trim()) {
        return fail(res, 400, "staff_id is required for salary");
      }

      if (!salary_month || !String(salary_month).trim()) {
        return fail(res, 400, "salary_month is required for salary");
      }

      if (!salary_year || !String(salary_year).trim()) {
        return fail(res, 400, "salary_year is required for salary");
      }
    }

    const payload = {
      txn_date: String(txn_date).trim(),
      category: cleanCategory,
      amount: Number(amount),
      description: String(description || "").trim(),
      staff_id: String(staff_id || "").trim(),
      salary_month: String(salary_month || "").trim(),
      salary_year: String(salary_year || "").trim(),
      total_kg:
        total_kg === undefined || total_kg === null || total_kg === ""
          ? 0
          : Number(total_kg),
      rate:
        rate === undefined || rate === null || rate === ""
          ? 0
          : Number(rate)
    };

    const created = await financeService.createExpense(payload, user);

    return ok(res, 201, "Expense created successfully", created);
  } catch (err) {
    console.error("finance.createExpense error:", err.message);

    return fail(
      res,
      400,
      err.message || "Failed to create expense",
      err.message || null
    );
  }
};

/**
 * GET /api/finance/rates?rate_type=&waste_type=
 */
exports.getRates = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return fail(res, 401, "Unauthorized");
    }

    const filters = {
      rate_type: req.query.rate_type || "",
      waste_type: req.query.waste_type || ""
    };

    const rows = await financeService.getRates(filters);

    return ok(res, 200, "Finance rates fetched successfully", rows);
  } catch (err) {
    console.error("finance.getRates error:", err.message);
    return fail(res, 500, "Failed to fetch finance rates", err.message);
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
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can create finance rates");
    }

    const { waste_type, rate_per_kg, rate_type } = req.body || {};

    const allowedWasteTypes = ["Wet", "Dry", "Plastic"];
    const allowedRateTypes = ["collection", "recycling"];

    if (!allowedWasteTypes.includes(String(waste_type || "").trim())) {
      return fail(res, 400, "waste_type must be one of: Wet, Dry, Plastic");
    }

    if (
      !allowedRateTypes.includes(String(rate_type || "").trim().toLowerCase())
    ) {
      return fail(res, 400, "rate_type must be one of: collection, recycling");
    }

    if (
      rate_per_kg === undefined ||
      rate_per_kg === null ||
      Number(rate_per_kg) < 0
    ) {
      return fail(res, 400, "rate_per_kg must be 0 or greater");
    }

    const payload = {
      waste_type: String(waste_type).trim(),
      rate_type: String(rate_type).trim().toLowerCase(),
      rate_per_kg: Number(rate_per_kg)
    };

    const created = await financeService.createRate(payload);

    return ok(res, 201, "Finance rate saved successfully", created);
  } catch (err) {
    console.error("finance.createRate error:", err.message);
    return fail(res, 500, "Failed to save finance rate", err.message);
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
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can update finance rates");
    }

    const { id } = req.params;
    const { rate_per_kg } = req.body || {};

    if (!id) {
      return fail(res, 400, "Rate id is required");
    }

    if (
      rate_per_kg === undefined ||
      rate_per_kg === null ||
      Number(rate_per_kg) < 0
    ) {
      return fail(res, 400, "rate_per_kg must be 0 or greater");
    }

    const updated = await financeService.updateRate(id, Number(rate_per_kg));

    return ok(res, 200, "Finance rate updated successfully", updated);
  } catch (err) {
    console.error("finance.updateRate error:", err.message);
    return fail(res, 500, "Failed to update finance rate", err.message);
  }
};

/**
 * DELETE /api/finance/transactions/:id
 * Only admin can delete manual expense entries
 */
exports.deleteTransaction = async (req, res) => {
  try {
    const user = getUser(req);

    if (!user) {
      return fail(res, 401, "Unauthorized");
    }

    if (!isAdmin(user)) {
      return fail(res, 403, "Only admin can delete finance transactions");
    }

    const { id } = req.params;

    if (!id) {
      return fail(res, 400, "Transaction id is required");
    }

    await financeService.deleteTransaction(id);

    return ok(res, 200, "Finance transaction deleted successfully");
  } catch (err) {
    console.error("finance.deleteTransaction error:", err.message);

    if (
      String(err.message || "").toLowerCase().includes("only manual expense")
    ) {
      return fail(res, 400, err.message);
    }

    return fail(res, 400, err.message || "Failed to delete finance transaction");
  }
};