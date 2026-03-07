const service = require("../services/staffVehicle.service");

exports.getAssignableStaff = async (req, res) => {
  try {
    const data = await service.getAssignableStaff();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const data = await service.getLogs(req.query);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.createTripLog = async (req, res) => {
  try {
    const data = await service.createTripLog(req.body, req.user);
    res.json({ ok: true, data, message: "Trip log saved" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

exports.updateLogStatus = async (req, res) => {
  try {
    const data = await service.updateLogStatus(req.params.id, req.body.status);
    res.json({ ok: true, data, message: "Status updated" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

exports.createManualTask = async (req, res) => {
  try {
    const data = await service.createManualTask(req.body, req.user);
    res.json({ ok: true, data, message: "Manual task created" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};