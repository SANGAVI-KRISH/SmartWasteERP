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
const ALLOWED_ORIGINS = [
  "https://smartwaste-erp.netlify.app","https://smartwaste-erp.netlify.app/",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:52984",
  "http://127.0.0.1:52984"
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);

    const isLocalhost = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);

    if (ALLOWED_ORIGINS.includes(origin) || isLocalhost) {
      return cb(null, true);
    }

    console.warn("CORS blocked origin:", origin);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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

    if (!decoded?.id) {
      return res.status(401).json({
        ok: false,
        message: "Invalid token payload"
      });
    }

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
   HEALTH / BASIC ROUTES
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

app.get("/api/debug-auth", requireSupabase, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1);

    return res.json({
      ok: !error,
      supabaseUrlSet: !!SUPABASE_URL,
      anonKeySet: !!ANON_KEY,
      serviceKeySet: !!SERVICE_KEY,
      jwtSecretSet: !!JWT_SECRET,
      dbQueryOk: !error,
      dbError: error?.message || null
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

/* =========================================================
   PROFILE CREATION
========================================================= */
app.post("/api/create-profile", requireSupabase, async (req, res) => {
  try {
    let { id, email, role, area, full_name } = req.body;

    email = String(email || "").trim().toLowerCase();
    role = normalizeRole(role);
    area = String(area || "").trim();
    full_name = String(full_name || "Not set").trim();

    if (!id || !email || !role || !area) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        ok: false,
        message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`
      });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert([{ id, email, role, area, full_name }], { onConflict: "id" });

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    return res.json({
      ok: true,
      message: "Profile created ✅",
      role,
      area,
      full_name
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

/* -------------------------
   LEGACY SIGNUP / LOGIN
-------------------------- */
app.post("/api/signup", requireSupabase, async (req, res) => {
  try {
    let { email, password, role, area, full_name } = req.body;

    email = String(email || "").trim().toLowerCase();
    role = normalizeRole(role);
    area = String(area || "").trim();
    full_name = String(full_name || "Not set").trim();

    if (!email || !password || !role || !area) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        ok: false,
        message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`
      });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
        area
      }
    });

    if (error || !data?.user) {
      return res.status(400).json({
        ok: false,
        message: error?.message || "Signup failed"
      });
    }

    const userId = data.user.id;

    const { error: perr } = await supabaseAdmin
      .from("profiles")
      .upsert([{ id: userId, email, role, area, full_name }], { onConflict: "id" });

    if (perr) {
      return res.status(400).json({
        ok: false,
        message: perr.message
      });
    }

    return res.json({
      ok: true,
      message: "User created ✅",
      user: { id: userId, email },
      profile: { role, area, full_name }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/login", requireSupabase, async (req, res) => {
  try {
    let { email, password } = req.body;
    email = String(email || "").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Missing email/password" });
    }

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

    const { data: profile, error: perr } = await supabaseAdmin
      .from("profiles")
      .select("role, area, email, id, full_name")
      .eq("id", data.user.id)
      .maybeSingle();

    if (perr) {
      return res.status(400).json({
        ok: false,
        message: perr.message
      });
    }

    if (!profile) {
      return res.status(404).json({
        ok: false,
        message: "Profile not found for this user"
      });
    }

    const token = jwt.sign(
      {
        id: data.user.id,
        email: data.user.email,
        role: String(profile.role || "").toLowerCase(),
        name: profile.full_name || null,
        area: profile.area || null
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      data: {
        token,
        role: String(profile.role || "").toLowerCase(),
        user: {
          id: data.user.id,
          email: data.user.email,
          role: String(profile.role || "").toLowerCase(),
          name: profile.full_name || null,
          area: profile.area || null
        },
        profile
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  return res.json({
    ok: true,
    data: {
      user: req.user,
      role: req.user.role || null
    }
  });
});

app.get("/api/profile-basic", authMiddleware, requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("role, area, email, id, full_name")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ ok: false, message: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, message: "Profile not found" });
    }

    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
});

/* -------------------------
   MODULAR ROUTES
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
   404 JSON fallback
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

  return res.status(500).json({
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