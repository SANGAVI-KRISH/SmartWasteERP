import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

/* ✅ CORS (ALLOW ONLY YOUR NETLIFY SITE) */
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || "https://smartwaste-erp.netlify.app";

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.options("*", cors());
app.use(express.json());

/* ---------- ENV ---------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in env");
}

/* ✅ DB client (service role) */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* ✅ Auth verify client (anon) */
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running ✅");
});

/* ---------------- AUTH CHECK ---------------- */
app.get("/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid session" });

    res.json(data.user);
  } catch (e) {
    res.status(401).json({ error: "Auth failed", details: e.message });
  }
});

/* ---------------- GET TASKS (ROLE-AWARE) ---------------- */
app.get("/tasks/:userid", async (req, res) => {
  const userid = req.params.userid;

  try {
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("role, area")
      .eq("id", userid)
      .single();

    if (pErr || !profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const role = profile.role;
    const area = profile.area;

    let query = supabaseAdmin
      .from("pickup_tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (role === "admin") {
      // admin sees all
    } else if (role === "recycling_manager") {
      query = query.eq("area", area).in("status", ["DELIVERED", "RECYCLED"]);
    } else {
      query = query.or(`assigned_worker_id.eq.${userid},assigned_driver_id.eq.${userid}`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: "Failed to fetch tasks", error });

    res.json(data || []);
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- WORKER COLLECT ---------------- */
app.post("/tasks/collect/:taskid", async (req, res) => {
  const taskid = req.params.taskid;
  const { collected_kg } = req.body || {};

  try {
    const payload = {
      status: "COLLECTED",
      collected_at: new Date().toISOString(),
    };

    if (collected_kg !== undefined && collected_kg !== null && collected_kg !== "") {
      payload.collected_kg = collected_kg;
    }

    const { error } = await supabaseAdmin
      .from("pickup_tasks")
      .update(payload)
      .eq("id", taskid);

    if (error) return res.status(500).json({ message: "Collect update failed", error });

    res.json({ message: "Marked collected ✅" });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- DRIVER DELIVER ---------------- */
app.post("/tasks/deliver/:taskid", async (req, res) => {
  const taskid = req.params.taskid;

  try {
    const { error } = await supabaseAdmin
      .from("pickup_tasks")
      .update({ status: "DELIVERED", delivered_at: new Date().toISOString() })
      .eq("id", taskid);

    if (error) return res.status(500).json({ message: "Deliver update failed", error });

    res.json({ message: "Marked delivered ✅" });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- RECYCLING ---------------- */
app.post("/tasks/recycle/:taskid", async (req, res) => {
  const taskid = req.params.taskid;
  const { received_kg, recycle_percent } = req.body || {};

  if (received_kg === undefined || recycle_percent === undefined) {
    return res.status(400).json({ message: "received_kg and recycle_percent are required" });
  }

  try {
    const { error } = await supabaseAdmin
      .from("pickup_tasks")
      .update({
        status: "RECYCLED",
        received_kg,
        recycle_percent,
        received_at: new Date().toISOString(),
        recycled_at: new Date().toISOString(),
      })
      .eq("id", taskid);

    if (error) return res.status(500).json({ message: "Recycling update failed", error });

    res.json({ message: "Recycling recorded ✅" });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
