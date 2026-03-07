const supabase = require("../config/supabase");

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(s) {
  return String(s || "").trim().toUpperCase();
}

function isAdmin(user) {
  return String(user?.role || "").trim().toLowerCase() === "admin";
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
    rows = rows.filter((r) => normalizeStatus(r.pickup_status || r.status) !== "RECYCLED");
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

  if (!area) throw new Error("Area is required.");
  if (!waste_type) throw new Error("Waste type is required.");
  if (!(quantity_kg > 0)) throw new Error("Quantity must be greater than 0.");

  const payload = {
    date,
    area,
    waste_type,
    quantity_kg,
    vehicle_id,
    bin_id,
    task_id,
    staff_task_id,
    created_at: new Date().toISOString(),
    created_by: user?.id || null,
    pickup_status: "COLLECTED"
  };

  const { data, error } = await supabase
    .from("collection_records")
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (task_id) {
    await supabase
      .from("pickup_tasks")
      .update({
        status: "COLLECTED",
        collected_kg: quantity_kg,
        updated_at: new Date().toISOString()
      })
      .eq("id", task_id);
  }

  if (bin_id) {
    await supabase
      .from("bins")
      .update({
        status: "EMPTY",
        updated_at: new Date().toISOString()
      })
      .eq("bin_id", bin_id);
  }

  return data;
};

exports.deleteCollection = async (id, user) => {
  if (!isAdmin(user)) {
    throw new Error("Only admin can delete collection records.");
  }

  if (!id) throw new Error("Collection id is required.");

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