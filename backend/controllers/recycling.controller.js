const service = require("../services/recycling.service");

exports.getAvailableSources = async (req, res) => {
  try {
    const data = await service.getAvailableSources();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.createRecyclingRecord = async (req, res) => {
  try {
    const data = await service.createRecyclingRecord(req.body, req.user);
    res.json({ ok: true, data, message: "Recycling entry saved" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.getRecyclingRecords = async (req, res) => {
  try {
    const data = await service.getRecyclingRecords(req.query, req.user);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};