const service = require("../services/profile.service");

exports.getMyProfile = async (req, res) => {
  try {
    const data = await service.getMyProfile(req.user);
    return res.json({ ok: true, data });
  } catch (err) {
    const msg = err.message || "Failed to load profile";

    if (msg === "Unauthorized") {
      return res.status(401).json({ ok: false, message: msg });
    }

    if (msg === "Profile not found") {
      return res.status(404).json({ ok: false, message: msg });
    }

    return res.status(500).json({ ok: false, message: msg });
  }
};

exports.changeMyPassword = async (req, res) => {
  try {
    const data = await service.changeMyPassword(
      req.user,
      req.body?.newPassword
    );

    return res.json({
      ok: true,
      data,
      message: data.message || "Password updated successfully"
    });
  } catch (err) {
    const msg = err.message || "Failed to update password";

    if (msg === "Unauthorized") {
      return res.status(401).json({ ok: false, message: msg });
    }

    if (msg === "Password must be at least 6 characters") {
      return res.status(400).json({ ok: false, message: msg });
    }

    return res.status(500).json({ ok: false, message: msg });
  }
};