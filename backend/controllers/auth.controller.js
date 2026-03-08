const authService = require("../services/auth.service");

// REGISTER
exports.register = async (req, res) => {
  try {
    const data = await authService.register(req.body);

    return res.status(201).json({
      ok: true,
      message: "Account created successfully",
      data
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: err.message || "Registration failed"
    });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const data = await authService.login(req.body);

    return res.json({
      ok: true,
      data
    });
  } catch (err) {
    return res.status(401).json({
      ok: false,
      message: err.message || "Login failed"
    });
  }
};

// CURRENT USER
exports.me = async (req, res) => {
  try {
    return res.json({
      ok: true,
      data: {
        user: req.user || null,
        role: req.user?.role || null
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to load current user"
    });
  }
};