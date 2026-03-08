const supabase = require("../config/supabase");

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(s) {
  return String(s || "").trim().toUpperCase();
}

async function getUserProfile(user) {

  const userId = user?.id || user?.sub || user?.userId;

  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data || null;
}

exports.getCollections = async ({ q, showRecycled }) => {
  const { data, error } = await supabase
    .from("collection_records")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  let rows = data || [];
  const includeRecycled = String(showRecycled || "").toLowerCase() === "true";

  if (!includeRecycled) {
    rows = rows.filter(
      (r) => normalizeStatus(r.pickup_status || r.status) !== "RECYCLED"
    );
  }

  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => {
      const hay = [
        r.id,
        r.date,
        r.area,
        r.waste_type,
        r.vehicle_id,
        r.bin_id,
        r.task_id,
        r.staff_task_id,
        r.pickup_status,
        r.status
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }

  return rows;
};

exports.getTaskPrefill = async (taskId) => {
  if (!taskId) throw new Error("task_id is required");

  const { data, error } = await supabase
    .from("pickup_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    task_id: data.id || null,
    area: data.area || data.location || data.zone || "",
    bin_id: data.bin_id || data.bin || ""
  };
};

exports.getStaffTaskPrefill = async (staffTaskId) => {
  if (!staffTaskId) throw new Error("staff_task_id is required");

  const { data, error } = await supabase
    .from("staff_tasks")
    .select("*")
    .eq("id", staffTaskId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    staff_task_id: data.id || null,
    route: data.route || data.area || data.location || "",
    vehicle_id: data.vehicle_id || ""
  };
};

exports.createCollection = async (body, user) => {
  const date = body?.date || new Date().toISOString().slice(0, 10);
  const area = String(body?.area || "").trim();
  const waste_type = String(body?.waste_type || "").trim();
  const quantity_kg = toNum(body?.quantity_kg);
  const vehicle_id = body?.vehicle_id ? String(body.vehicle_id).trim() : null;
  const bin_id = body?.bin_id ? String(body.bin_id).trim() : null;
  const task_id = body?.task_id ? String(body.task_id).trim() : null;
  const staff_task_id = body?.staff_task_id ? String(body.staff_task_id).trim() : null;

  const profile = await getUserProfile(user);
  const userId = profile?.id || user?.id || user?.userId || user?.sub || null;

  if (!area) throw new Error("Area is required.");
  if (!waste_type) throw new Error("Waste type is required.");
  if (!(quantity_kg > 0)) throw new Error("Quantity must be greater than 0.");

  const payload = {
  user_id: userId,
  date,
  area,
  waste_type,
  quantity_kg,
  vehicle_id,
  bin_id,
  task_id,
  staff_task_id,
  created_at: new Date().toISOString()
};

  const { data, error } = await supabase
    .from("collection_records")
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (task_id) {
    const { error: taskError } = await supabase
      .from("pickup_tasks")
      .update({
        status: "COLLECTED",
        collected_kg: quantity_kg,
        updated_at: new Date().toISOString()
      })
      .eq("id", task_id);

    if (taskError) {
      console.error("pickup_tasks update failed:", taskError.message);
    }
  }

  if (bin_id) {
    const { error: binError } = await supabase
      .from("bins")
      .update({
        status: "Empty",
        updated_at: new Date().toISOString()
      })
      .eq("bin_id", bin_id);

    if (binError) {
      console.error("bins update failed:", binError.message);
    }
  }

  return data;
};

exports.deleteCollection = async (id, user) => {
  if (!id) throw new Error("Collection id is required.");

  const profile = await getUserProfile(user);

  if (!profile) {
    throw new Error("User profile not found.");
  }

  if (String(profile.role || "").trim().toLowerCase() !== "admin") {
    throw new Error("Only admin can delete collection records.");
  }

  const { data: existing, error: fetchError } = await supabase
    .from("collection_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error("Collection record not found.");

  const { error } = await supabase
    .from("collection_records")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  return { ok: true };
};