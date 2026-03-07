const service = require("../services/map.service");

exports.getFullBinsForMap = async (req, res) => {
  try {
    const data = await service.getFullBinsForMap();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};