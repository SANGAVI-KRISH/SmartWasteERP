const supabase = require("../config/supabase");

function escText(v) {
  return String(v ?? "").trim();
}

/* ---------------- DATE NORMALIZER ---------------- */

function normalizeDate(input) {
  const v = String(input || "").trim();

  if (!v) return new Date().toISOString().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  return new Date().toISOString().slice(0, 10);
}

/* ---------------- GET STAFF ---------------- */

exports.getAssignableStaff = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["worker", "driver"])
    .order("role", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    id: row.id,
    name: row.full_name || row.email || "",
    full_name: row.full_name || "",
    email: row.email || "",
    role: row.role || ""
  }));
};

/* ---------------- GET ACTIVITY LOGS ---------------- */

exports.getLogs = async ({ q }) => {
  const selects = [
    "id,date,vehicle_id,staff_name,route,shift,status,task_id,created_at",
    "*"
  ];

  let rows = [];
  let loaded = false;

  for (const sel of selects) {
    const res = await supabase
      .from("staff_tasks")
      .select(sel)
      .order("created_at", { ascending: false });

    if (!res.error) {
      rows = res.data || [];
      loaded = true;
      break;
    }
  }

  if (!loaded) throw new Error("Failed to load activity logs");

  let result = rows.map((r) => ({
    id: r.id,
    date: r.date || r.vdate || "",
    vehicle_id: r.vehicle_id || "",
    staff_name: r.staff_name || r.assigned_staff_name || "",
    route: r.route || r.area || "",
    shift: r.shift || "",
    status: r.status || "",
    task_id: r.task_id || r.pickup_task_id || ""
  }));

  const needle = String(q || "").toLowerCase().trim();

  if (needle) {
    result = result.filter((r) =>
      `${r.vehicle_id} ${r.staff_name} ${r.route} ${r.shift} ${r.status} ${r.task_id}`
        .toLowerCase()
        .includes(needle)
    );
  }

  return result;
};

/* ---------------- CREATE TRIP LOG ---------------- */

exports.createTripLog = async (body, user) => {

  const payload = {
    date: normalizeDate(body.date),

    // if empty → default value
    vehicle_id: escText(body.vehicle_id) || "Not Assigned",

    staff_name: escText(body.staff_name),
    route: escText(body.route),
    shift: escText(body.shift) || "Morning",
    status: escText(body.status) || "Assigned",
    task_id: escText(body.task_id) || null,
    created_by: user?.id || null
  };

  if (!payload.staff_name) throw new Error("Staff Name is required");
  if (!payload.route) throw new Error("Assigned Area / Route is required");

  const { data, error } = await supabase
    .from("staff_tasks")
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

/* ---------------- UPDATE STATUS ---------------- */

exports.updateLogStatus = async (id, status) => {
  const { data, error } = await supabase
    .from("staff_tasks")
    .update({ status })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

/* ---------------- CREATE MANUAL TASK ---------------- */

exports.createManualTask = async (body, user) => {

  const assigned_to = escText(body.assigned_to);
  const task_type = escText(body.task_type) || "pickup";
  const route = escText(body.route);
  const vehicle_id = escText(body.vehicle_id) || "Not Assigned";
  const priority = escText(body.priority) || "normal";
  const due_date = normalizeDate(body.due_date);

  const bin_id_input = escText(body.bin_id) || "";
  const notes_input = escText(body.notes) || "";

  if (!assigned_to) throw new Error("Please select staff");
  if (!route) throw new Error("Please enter route");

  const extraText = [notes_input, bin_id_input ? `Bin: ${bin_id_input}` : ""]
    .filter(Boolean)
    .join(" | ");

  const payload = {
    assigned_to,
    task_type,
    date: due_date,
    vehicle_id,
    route: extraText ? `${route} | ${extraText}` : route,
    shift: "Morning",
    status: "Assigned",
    staff_name: assigned_to,
    created_by: user?.id || null
  };

  const { data, error } = await supabase
    .from("staff_tasks")
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};