const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role key
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

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) return res.status(400).json({ error: error.message });

    const userId = data.user.id;

    const { error: perr } = await supabase.from("profiles").insert([{
      id: userId,
      email,
      role,
      area
    }]);

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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { id: data.user.id, email: data.user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: data.user.id, email: data.user.email } });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Backend running on", PORT));
