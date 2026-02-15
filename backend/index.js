import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const cors = require("cors");
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"]
}));


dotenv.config();

const app = express();

/* ---------- MIDDLEWARE ---------- */
app.use(
  cors({
    origin: "*", // allow Netlify/Vercel frontend
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

/* ---------- ENV CHECK ---------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables");
}

/* ---------- SUPABASE ---------- */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running 🚀");
});

/* ---------------- GET TASKS (ROLE-AWARE) ----------------
   - worker/driver: only assigned tasks
   - recycling_manager: tasks in same area (DELIVERED/RECYCLED)
   - admin: all tasks
*/
app.get("/tasks/:userid", async (req, res) => {
  const userid = req.params.userid;

  try {
    // 1) read user role + area from profiles
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role, area")
      .eq("id", userid)
      .single();

    if (pErr || !profile) {
      return res.status(404).json({ message: "Profile not found", error: pErr });
    }

    const role = profile.role;
    const area = profile.area;

    let query = supabase.from("pickup_tasks").select("*").order("created_at", { ascending: false });

    // 2) apply filters based on role
    if (role === "admin") {
      // no filter → admin sees all tasks
    } else if (role === "recycling_manager") {
      // manager sees tasks in their area (DELIVERED or RECYCLED; you can change)
      query = query
        .eq("area", area)
        .in("status", ["DELIVERED", "RECYCLED"]);
    } else if (role === "worker" || role === "driver") {
      // worker/driver sees only assigned tasks
      query = query.or(`assigned_worker_id.eq.${userid},assigned_driver_id.eq.${userid}`);
    } else {
      // fallback: safest is assigned tasks only
      query = query.or(`assigned_worker_id.eq.${userid},assigned_driver_id.eq.${userid}`);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ message: "Failed to fetch tasks", error });

    res.json(data || []);
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- WORKER COLLECT ----------------
   Optional: accepts body { collected_kg }
*/
app.post("/tasks/collect/:taskid", async (req, res) => {
  const taskid = req.params.taskid;
  const { collected_kg } = req.body || {};

  try {
    const updatePayload = {
      status: "COLLECTED",
      collected_at: new Date().toISOString(),
    };

    // store kg if provided
    if (collected_kg !== undefined && collected_kg !== null && collected_kg !== "") {
      updatePayload.collected_kg = collected_kg;
    }

    const { error } = await supabase.from("pickup_tasks").update(updatePayload).eq("id", taskid);

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
    const { error } = await supabase
      .from("pickup_tasks")
      .update({
        status: "DELIVERED",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", taskid);

    if (error) return res.status(500).json({ message: "Deliver update failed", error });

    res.json({ message: "Marked delivered ✅" });
  } catch (e) {
    res.status(500).json({ message: "Server error", error: e.message });
  }
});

/* ---------------- RECYCLING ----------------
   body: { received_kg, recycle_percent }
*/
app.post("/tasks/recycle/:taskid", async (req, res) => {
  const taskid = req.params.taskid;
  const { received_kg, recycle_percent } = req.body || {};

  if (received_kg === undefined || recycle_percent === undefined) {
    return res.status(400).json({ message: "received_kg and recycle_percent are required" });
  }

  try {
    const { error } = await supabase
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

/* ---------------- START SERVER (RENDER) ---------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

app.get("/me", async (req, res) => {

  const token = req.headers.authorization?.split(" ")[1];

  if(!token){
    return res.status(401).json({ error: "No token" });
  }

  try{
    const { data, error } = await supabase.auth.getUser(token);

    if(error) return res.status(401).json({ error: "Invalid session" });

    res.json(data.user);

  }catch{
    res.status(401).json({ error: "Auth failed" });
  }
});
