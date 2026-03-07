const service = require("../services/salary.service");

exports.getMySalary = async (req, res) => {
  try {
    const data = await service.getMySalary(req.user);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};