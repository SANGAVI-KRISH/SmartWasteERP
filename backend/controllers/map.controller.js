const service = require("../services/map.service");

exports.getFullBinsForMap = async (req, res) => {
  try {
    const data = await service.getFullBinsForMap();

    return res.status(200).json({
      ok: true,
      count: Array.isArray(data) ? data.length : 0,
      data
    });
  } catch (err) {
    console.error("getFullBinsForMap error:", err);

    return res.status(500).json({
      ok: false,
      message: err?.message || "Failed to load map bins"
    });
  }
};