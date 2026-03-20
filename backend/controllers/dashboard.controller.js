const service = require("../services/dashboard.service");

exports.getDashboardSummary = async (req, res) => {
  try {
    const data = await service.getDashboardSummary();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("Dashboard summary error:", err);
    res.status(500).json({
      ok: false,
      message: err.message || "Failed to load dashboard summary",
    });
  }
};