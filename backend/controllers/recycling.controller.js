const service = require("../services/recycling.service");

function getStatusCode(err) {
  const msg = String(err?.message || "").toLowerCase();

  if (
    msg.includes("already recycled") ||
    msg.includes("already exists") ||
    msg.includes("duplicate") ||
    msg.includes("invalid dropdown value") ||
    msg.includes("invalid recycling record id") ||
    msg.includes("please select") ||
    msg.includes("must be greater than 0") ||
    msg.includes("cannot be negative") ||
    msg.includes("must not exceed")
  ) {
    return 400;
  }

  if (msg.includes("not found")) return 404;
  if (msg.includes("unauthorized")) return 401;
  if (msg.includes("forbidden")) return 403;

  return 500;
}

exports.getAvailableSources = async (req, res) => {
  try {
    const data = await service.getAvailableSources();
    res.json({ ok: true, data });
  } catch (err) {
    console.error("getAvailableSources error:", err);
    res.status(getStatusCode(err)).json({
      ok: false,
      message: err.message || "Failed to load available recycling sources"
    });
  }
};

exports.createRecyclingRecord = async (req, res) => {
  try {
    const data = await service.createRecyclingRecord(req.body);
    res.json({ ok: true, data, message: "Recycling entry saved" });
  } catch (err) {
    console.error("createRecyclingRecord error:", err);
    res.status(getStatusCode(err)).json({
      ok: false,
      message: err.message || "Failed to save recycling entry"
    });
  }
};

exports.getRecyclingRecords = async (req, res) => {
  try {
    const data = await service.getRecyclingRecords(req.query);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("getRecyclingRecords error:", err);
    res.status(getStatusCode(err)).json({
      ok: false,
      message: err.message || "Failed to load recycling records"
    });
  }
};

exports.deleteRecyclingRecord = async (req, res) => {
  try {
    const data = await service.deleteRecyclingRecord(req.params.id);
    res.json({ ok: true, data, message: "Recycling record deleted" });
  } catch (err) {
    console.error("deleteRecyclingRecord error:", err);
    res.status(getStatusCode(err)).json({
      ok: false,
      message: err.message || "Failed to delete recycling record"
    });
  }
};