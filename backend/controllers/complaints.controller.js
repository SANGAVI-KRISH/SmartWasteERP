const service = require("../services/complaints.service");

exports.getComplaints = async (req, res) => {
  try {
    const data = await service.getComplaints(req.query);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err.message || "Failed to fetch complaints"
    });
  }
};

exports.createComplaint = async (req, res) => {
  try {
    const data = await service.createComplaint(req.body, req.user);
    res.json({ ok: true, data, message: "Complaint created successfully" });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err.message || "Failed to create complaint"
    });
  }
};

exports.updateComplaintStatus = async (req, res) => {
  try {
    const data = await service.updateComplaintStatus(
      req.params.id,
      req.body.status,
      req.user
    );
    res.json({ ok: true, data, message: "Complaint status updated" });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err.message || "Failed to update complaint status"
    });
  }
};