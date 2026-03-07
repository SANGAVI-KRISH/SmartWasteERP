const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "smartwaste_secret_key";

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Invalid or expired token" });
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    const allowed = allowedRoles.map(r => String(r).toLowerCase());

    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRoles
};