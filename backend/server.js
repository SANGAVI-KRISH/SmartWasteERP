// server.js
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

/* -------------------------
   CORS
-------------------------- */
const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://smartwaste-erp.netlify.app",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman/no-origin
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());
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

// Create clients only if we have the required vars (prevents crash loops)
const supabaseAdmin = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;
const supabaseAuth = SUPABASE_URL && ANON_KEY ? createClient(SUPABASE_URL, ANON_KEY) : null;

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
      error: "Backend misconfigured (missing Supabase env vars). Check Render env.",
    });
  }
  next();
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* -------------------------
   Routes
-------------------------- */

// Health
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running 🚀");
});

// Optional: quick env/auth connectivity check (safe, no secrets shown)
app.get("/api/debug-auth", requireSupabase, async (req, res) => {
  try {
    // simple query to ensure DB connection works
    const { error } = await supabaseAdmin.from("profiles").select("id").limit(1);
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

// Signup
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

    // Create Auth user (admin)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // demo-friendly
    });

    if (error || !data?.user) {
      return res.status(400).json({
        error: "Signup failed",
        supabase_error: error?.message || "No user returned",
      });
    }

    const userId = data.user.id;

    // Upsert profile (no duplicate key issue)
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
      message: "User created ✅",
      user: { id: userId, email },
      profile: { role, area },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Login
app.post("/api/login", requireSupabase, async (req, res) => {
  try {
    let { email, password } = req.body;
    email = String(email || "").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email/password" });
    }

    // Sign in using ANON client
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      // ✅ expose real reason (so you can fix immediately)
      return res.status(401).json({
        error: "Login failed",
        supabase_error: error?.message || "No user returned",
      });
    }

    // Create JWT for your app
    const token = jwt.sign(
      { id: data.user.id, email: data.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Fetch profile using ADMIN client (bypass RLS)
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

    // If profile missing, create default (safety)
    let finalProfile = profile;
    if (!finalProfile) {
      const { error: ierr } = await supabaseAdmin
        .from("profiles")
        .upsert(
          [
            {
              id: data.user.id,
              email: data.user.email,
              role: "worker",
              area: "General",
            },
          ],
          { onConflict: "id" }
        );

      if (ierr) {
        return res.status(400).json({
          error: "Profile auto-create failed",
          supabase_error: ierr.message,
        });
      }

      const again = await supabaseAdmin
        .from("profiles")
        .select("role, area, email, id")
        .eq("id", data.user.id)
        .maybeSingle();

      finalProfile = again.data || null;
    }

    return res.json({
      token,
      user: { id: data.user.id, email: data.user.email },
      profile: finalProfile,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Me
app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// Profile
app.get("/api/profile", authMiddleware, requireSupabase, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, area, email, id")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Profile not found" });

  res.json(data);
});

// 404 JSON fallback
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

/* -------------------------
   Start Server
-------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("✅ Backend running on", PORT));
