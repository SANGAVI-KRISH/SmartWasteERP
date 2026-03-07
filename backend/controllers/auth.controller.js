const authService = require("../services/auth.service");

// REGISTER
exports.register = async (req, res) => {
  try {
    const data = await authService.register(req.body);
    res.json({ ok: true, data, message: "Account created successfully" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const data = await authService.login(req.body);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(401).json({ ok: false, message: err.message });
  }
};

// CURRENT USER
exports.me = async (req, res) => {
  try {
    res.json({
      ok: true,
      data: {
        user: req.user,
        role: req.user?.role || null
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};