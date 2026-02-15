import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Validate env variables
if (!process.env.SUPABASE_URL) {
  console.error("❌ Missing SUPABASE_URL in environment variables");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment variables");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ✅ service role key (NOT anon key)
);

const JWT_SECRET = process.env.JWT_SECRET || "smartwaste-secret";

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "SmartWaste backend running" });
});

// ✅ Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, role, area } = req.body;

    if (!email || !password || !role || !area) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // create user in Supabase Auth (Admin)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) return res.status(400).json({ error: error.message });

    const userId = data.user.id;

    // create profile record
    const { error: perr } = await supabase.from("profiles").insert([
      { id: userId, email, role, area }
    ]);

    if (perr) return res.status(400).json({ error: perr.message });

    res.json({ message: "User created ✅" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // login using Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { id: data.user.id, email: data.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: data.user.id, email: data.user.email }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ Middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ✅ Me
app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("✅ Backend running on port", PORT));
