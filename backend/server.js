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
app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "https://smartwaste-erp.netlify.app", // ✅ your netlify frontend
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// handle preflight quickly
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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY); // bypass RLS
const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY);     // auth sign-in

/* -------------------------
   Helpers
-------------------------- */
const ALLOWED_ROLES = ["admin", "worker", "driver", "recycling_manager"];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
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

// ✅ Health
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running 🚀");
});

// ✅ Signup (creates auth user + profile)
app.post("/api/signup", async (req, res) => {
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
      email_confirm: true,
    });

    if (error) return res.status(400).json({ error: error.message });
    const userId = data.user.id;

    // Insert profile row (admin bypasses RLS)
    const { error: perr } = await supabaseAdmin
  .from("profiles")
  .upsert([{ id: userId, email, role, area }], { onConflict: "id" });


    if (perr) return res.status(400).json({ error: perr.message });

    return res.json({
      message: "User created ✅",
      user: { id: userId, email },
      profile: { role, area },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ✅ Login (auth + returns profile + jwt)
app.post("/api/login", async (req, res) => {
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
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create our JWT
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

    // Optional safety: if profile missing, create default
    if (!profile && !perr) {
      const { error: ierr } = await supabaseAdmin.from("profiles").insert([
        {
          id: data.user.id,
          email: data.user.email,
          role: "worker",
          area: "General",
        },
      ]);
      if (ierr) return res.status(400).json({ error: ierr.message });

      const again = await supabaseAdmin
        .from("profiles")
        .select("role, area, email, id")
        .eq("id", data.user.id)
        .maybeSingle();

      return res.json({
        token,
        user: { id: data.user.id, email: data.user.email },
        profile: again.data || null,
      });
    }

    if (perr) return res.status(400).json({ error: perr.message });

    return res.json({
      token,
      user: { id: data.user.id, email: data.user.email },
      profile: profile || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ✅ Me (token validation)
app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// ✅ Profile (frontend can call this instead of supabase direct)
app.get("/api/profile", authMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, area, email, id")
    .eq("id", req.user.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Profile not found" });

  res.json(data);
});

/* -------------------------
   Start Server
-------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("✅ Backend running on", PORT));
