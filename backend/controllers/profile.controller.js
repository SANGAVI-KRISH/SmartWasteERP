const service = require("../services/profile.service");

exports.getMyProfile = async (req, res) => {
  try {
    const data = await service.getMyProfile(req.user);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const data = await service.changeMyPassword(req.user, req.body.newPassword);
    res.json({ ok: true, data, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};