// backend/server.js

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
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
const salaryRoutes = require("./routes/salary.routes");

dotenv.config();

const app = express();

/* -------------------------
   CORS
-------------------------- */
const ALLOWED_ORIGINS = [
  "https://smartwaste-erp.netlify.app",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Postman/curl/no-origin

      const isLocalhost =
        /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);

      if (ALLOWED_ORIGINS.includes(origin) || isLocalhost) {
        return cb(null, true);
      }

      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

/* -------------------------
   ENV + SUPABASE CLIENTS
-------------------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "smartwaste-secret";

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    "❌ Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY"
  );
}

const supabaseAdmin =
  SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

const supabaseAuth =
  SUPABASE_URL && ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : null;

/* -------------------------
   Helpers
-------------------------- */
const ALLOWED_ROLES = ["admin", "worker", "driver", "recycling_manager"];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function requireSupabase(req, res, next) {
  if (!supabaseAdmin || !supabaseAuth) {
    return res.status(500).json({
      error: "Backend misconfigured (missing Supabase env vars). Check environment variables.",
    });
  }
  next();
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* -------------------------
   Health / Basic Routes
-------------------------- */
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running 🚀");
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
      dbQueryOk: !error,
      dbError: error?.message || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================
   Profile Creation
========================================================= */
app.post("/api/create-profile", requireSupabase, async (req, res) => {
  try {
    let { id, email, role, area } = req.body;

    email = String(email || "").trim().toLowerCase();
    role = normalizeRole(role);
    area = String(area || "").trim();

    if (!id || !email || !role || !area) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`,
      });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert([{ id, email, role, area }], { onConflict: "id" });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ ok: true, message: "Profile created ✅", role, area });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* -------------------------
   Legacy Signup / Login
-------------------------- */
app.post("/api/signup", requireSupabase, async (req, res) => {
  try {
    let { email, password, role, area } = req.body;

    email = String(email || "").trim().toLowerCase();
    role = normalizeRole(role);
    area = String(area || "").trim();

    if (!email || !password || !role || !area) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`,
      });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data?.user) {
      return res.status(400).json({
        error: "Signup failed",
        supabase_error: error?.message || "No user returned",
      });
    }

    const userId = data.user.id;

    const { error: perr } = await supabaseAdmin
      .from("profiles")
      .upsert([{ id: userId, email, role, area }], { onConflict: "id" });

    if (perr) {
      return res.status(400).json({
        error: "Profile upsert failed",
        supabase_error: perr.message,
      });
    }

    return res.json({
      ok: true,
      message: "User created ✅",
      user: { id: userId, email },
      profile: { role, area },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/login", requireSupabase, async (req, res) => {
  try {
    let { email, password } = req.body;
    email = String(email || "").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email/password" });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      return res.status(401).json({
        error: "Login failed",
        supabase_error: error?.message || "No user returned",
      });
    }

    const token = jwt.sign(
      { id: data.user.id, email: data.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { data: profile, error: perr } = await supabaseAdmin
      .from("profiles")
      .select("role, area, email, id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (perr) {
      return res.status(400).json({
        error: "Profile fetch failed",
        supabase_error: perr.message,
      });
    }

    if (!profile) {
      return res.status(404).json({
        error: "Profile not found for this user.",
        hint: "Your /api/create-profile call may have failed earlier. Signup again.",
      });
    }

    return res.json({
      ok: true,
      token,
      user: { id: data.user.id, email: data.user.email },
      profile,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

app.get("/api/profile-basic", authMiddleware, requireSupabase, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("role, area, email, id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Profile not found" });

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/* -------------------------
   Modular Routes
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
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

/* -------------------------
   Error handler
-------------------------- */
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err.message);
  res.status(500).json({
    error: err.message || "Internal server error",
  });
});

/* -------------------------
   Start Server
-------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("✅ Backend running on", PORT);
});