import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("Smart Waste ERP Backend Running");
});

/* ---------------- GET TASKS ---------------- */
app.get("/tasks/:userid", async (req, res) => {
  const userid = req.params.userid;

  const { data, error } = await supabase
    .from("pickup_tasks")
    .select("*")
    .or(`assigned_worker_id.eq.${userid},assigned_driver_id.eq.${userid}`)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json(error);

  res.json(data);
});

/* ---------------- WORKER COLLECT ---------------- */
app.post("/tasks/collect/:taskid", async (req, res) => {
  const taskid = req.params.taskid;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "COLLECTED",
      collected_at: new Date()
    })
    .eq("id", taskid);

  if (error) return res.status(500).json(error);

  res.json({ message: "Marked collected" });
});

/* ---------------- DRIVER DELIVER ---------------- */
app.post("/tasks/deliver/:taskid", async (req, res) => {
  const taskid = req.params.taskid;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "DELIVERED",
      delivered_at: new Date()
    })
    .eq("id", taskid);

  if (error) return res.status(500).json(error);

  res.json({ message: "Marked delivered" });
});

/* ---------------- RECYCLING ---------------- */
app.post("/tasks/recycle/:taskid", async (req, res) => {
  const taskid = req.params.taskid;
  const { received_kg, recycle_percent } = req.body;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "RECYCLED",
      received_kg,
      recycle_percent,
      received_at: new Date(),
      recycled_at: new Date()
    })
    .eq("id", taskid);

  if (error) return res.status(500).json(error);

  res.json({ message: "Recycling recorded" });
});

/* ---------------- START SERVER ---------------- */
app.listen(5000, () => {
  console.log("Backend running on port 5000");
});