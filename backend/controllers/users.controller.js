const usersService = require("../services/users.service");

exports.getUsers = async (req, res) => {
  try {
    const data = await usersService.getUsers();
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const data = await usersService.updateUser(req.params.id, req.body);
    res.json({ ok: true, data, message: "User updated successfully" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};