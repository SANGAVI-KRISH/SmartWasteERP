const service = require("../services/collection.service");

exports.getCollections = async (req, res) => {
  try {
    const result = await service.getCollections(req.query);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.getTaskPrefill = async (req, res) => {
  try {
    const result = await service.getTaskPrefill(req.query.task_id);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.getStaffTaskPrefill = async (req, res) => {
  try {
    const result = await service.getStaffTaskPrefill(req.query.staff_task_id);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.createCollection = async (req, res) => {
  try {
    const result = await service.createCollection(req.body, req.user || null);
    res.json({ ok: true, data: result, message: "Collection saved" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const result = await service.deleteCollection(req.params.id, req.user || null);
    res.json({ ok: true, data: result, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};