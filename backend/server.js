// backend/server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const dashboardRoutes = require("./routes/dashboard.routes.js");
const authRoutes = require("./routes/auth.routes.js");
const mapRoutes = require("./routes/map.routes.js");
const profileRoutes = require("./routes/profile.routes.js");
const recyclingRoutes = require("./routes/recycling.routes.js");
const reportRoutes = require("./routes/report.routes.js");
const staffVehicleRoutes = require("./routes/staffVehicle.routes.js");
const tasksRoutes = require("./routes/tasks.routes.js");
const usersRoutes = require("./routes/users.routes.js");
const binsRoutes = require("./routes/bins.routes.js");
const collectionRoutes = require("./routes/collection.routes.js");
const complaintsRoutes = require("./routes/complaints.routes.js");
const financeRoutes = require("./routes/finance.routes.js");
const salaryRoutes = require("./routes/salary.routes.js");

const app = express();

/* -------------------------
   ENV
-------------------------- */

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    "❌ Missing env vars. Need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
  );
}

/* -------------------------
   SUPABASE CLIENTS
-------------------------- */

const supabaseAdmin =
  SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

const supabaseAuth =
  SUPABASE_URL && ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : null;

/* -------------------------
   CORS
-------------------------- */

const EXACT_ALLOWED_ORIGINS = [
  "https://smartwaste-erp.netlify.app",
  "https://smart-waste-erp.netlify.app",
  "https://smart-waste-erp.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000"
];

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const cleanOrigin = String(origin).replace(/\/$/, "");

  if (EXACT_ALLOWED_ORIGINS.includes(cleanOrigin)) {
    return true;
  }

  const localhostPattern = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
  if (localhostPattern.test(cleanOrigin)) {
    return true;
  }

  const vercelPreviewPattern =
    /^https:\/\/[a-z0-9-]+-sangavi-ks-projects\.vercel\.app$/i;
  if (vercelPreviewPattern.test(cleanOrigin)) {
    return true;
  }

  const vercelGitPreviewPattern =
    /^https:\/\/smart-waste-erp-git-[a-z0-9-]+-sangavi-ks-projects\.vercel\.app$/i;
  if (vercelGitPreviewPattern.test(cleanOrigin)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) {
      return cb(null, true);
    }

    const cleanOrigin = String(origin || "").replace(/\/$/, "");
    console.warn("❌ CORS blocked:", cleanOrigin);
    return cb(new Error(`CORS blocked for origin: ${cleanOrigin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"]
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* -------------------------
   BODY PARSING
-------------------------- */

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* -------------------------
   HELPERS
-------------------------- */

const ALLOWED_ROLES = ["admin", "worker", "driver", "recycling_manager"];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function requireSupabase(req, res, next) {
  if (!supabaseAdmin || !supabaseAuth) {
    return res.status(500).json({
      ok: false,
      message: "Backend misconfigured. Check Supabase environment variables."
    });
  }

  next();
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      ok: false,
      message: "Missing authorization token"
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: decoded.id,
      email: decoded.email || null,
      role: String(decoded.role || "").toLowerCase(),
      name: decoded.name || null,
      area: decoded.area || null
    };

    next();
  } catch (e) {
    return res.status(401).json({
      ok: false,
      message: "Invalid or expired token"
    });
  }
}

/* -------------------------
   HEALTH ROUTES
-------------------------- */

app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is healthy",
    time: new Date().toISOString()
  });
});

/* -------------------------
   LOGIN
-------------------------- */

app.post("/api/login", requireSupabase, async (req, res) => {
  try {
    let { email, password } = req.body;

    email = String(email || "").trim().toLowerCase();

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.user) {
      return res.status(401).json({
        ok: false,
        message: error?.message || "Login failed"
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    const token = jwt.sign(
      {
        id: data.user.id,
        email: data.user.email,
        role: profile.role,
        name: profile.full_name,
        area: profile.area
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      data: {
        token,
        role: profile.role,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: profile.role,
          name: profile.full_name,
          area: profile.area
        }
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/* -------------------------
   USER
-------------------------- */

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({
    ok: true,
    data: {
      user: req.user,
      role: req.user.role
    }
  });
});

/* -------------------------
   ROUTES
-------------------------- */

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/recycling", recyclingRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/staff-vehicle", staffVehicleRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bins", binsRoutes);
app.use("/api/collection", collectionRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/salary", salaryRoutes);

/* -------------------------
   404
-------------------------- */

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Route not found",
    path: req.originalUrl
  });
});

/* -------------------------
   ERROR HANDLER
-------------------------- */

app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);

  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      ok: false,
      message: err.message
    });
  }

  res.status(500).json({
    ok: false,
    message: err.message || "Internal server error"
  });
});

/* -------------------------
   START SERVER
-------------------------- */

app.listen(PORT, () => {
  console.log(`✅ Backend running on ${PORT}`);
  console.log(`✅ JWT secret loaded: ${Boolean(JWT_SECRET)}`);
});