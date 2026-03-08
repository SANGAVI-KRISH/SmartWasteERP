const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in environment variables");
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim() || null;
}

function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email || null,
      role: String(decoded.role || "").toLowerCase(),
      name: decoded.name || null,
      area: decoded.area || null
    };

    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
}

function requireRoles(...allowedRoles) {
  const allowed = allowedRoles.map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();

    if (!role) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

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