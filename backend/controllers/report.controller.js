const reportService = require("../services/report.service");

exports.getReportSummary = async (req, res) => {
  try {
    const data = await reportService.getReportSummary();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};