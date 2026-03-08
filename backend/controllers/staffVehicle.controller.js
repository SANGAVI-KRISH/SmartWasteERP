const service = require("../services/staffVehicle.service");

function isCompletedStatus(status) {
  return String(status || "").trim().toLowerCase() === "completed";
}

exports.getAssignableStaff = async (req, res) => {
  try {
    const data = await service.getAssignableStaff();
    return res.status(200).json({
      ok: true,
      data
    });
  } catch (err) {
    console.error("getAssignableStaff error:", err);
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to load staff"
    });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const data = await service.getLogs(req.query || {});

    const filtered = (data || []).filter(
      (row) => !isCompletedStatus(row?.status)
    );

    return res.status(200).json({
      ok: true,
      data: filtered
    });
  } catch (err) {
    console.error("getLogs error:", err);
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to load logs"
    });
  }
};

exports.createTripLog = async (req, res) => {
  try {
    const data = await service.createTripLog(req.body || {}, req.user);
    return res.status(200).json({
      ok: true,
      data,
      message: "Trip log saved"
    });
  } catch (err) {
    console.error("createTripLog error:", err);
    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to save trip log"
    });
  }
};

exports.updateLogStatus = async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim();

    const data = await service.updateLogStatus(req.params.id, status);

    return res.status(200).json({
      ok: true,
      data,
      message: "Status updated"
    });
  } catch (err) {
    console.error("updateLogStatus error:", err);
    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to update status"
    });
  }
};

exports.createManualTask = async (req, res) => {
  try {
    const data = await service.createManualTask(req.body || {}, req.user);

    return res.status(200).json({
      ok: true,
      data,
      message: "Manual task created and assigned"
    });
  } catch (err) {
    console.error("createManualTask error:", err);
    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to create manual task"
    });
  }
};