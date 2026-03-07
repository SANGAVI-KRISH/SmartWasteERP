const service = require("../services/dashboard.service");

exports.getDashboardSummary = async (req, res) => {
  try {
    const data = await service.getDashboardSummary();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};