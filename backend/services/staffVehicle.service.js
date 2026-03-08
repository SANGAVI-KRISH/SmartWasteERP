const supabase = require("../config/supabase");
const { randomUUID } = require("crypto");

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

function normalizeStatus(v) {
  return String(v || "").trim();
}

function isCompletedStatus(v) {
  return normalizeStatus(v).toLowerCase() === "completed";
}

function ensureUuid(v) {
  const s = escText(v);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(s) ? s : randomUUID();
}

/* ---------------- GET STAFF DISPLAY NAME ---------------- */

async function getStaffDisplayName(userId) {
  if (!userId) return "";

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name,email,role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return userId;

  return data.full_name || data.email || userId;
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

exports.getLogs = async ({ q } = {}) => {
  const { data, error } = await supabase
    .from("staff_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  let result = (data || [])
    .filter((r) => !isCompletedStatus(r.status))
    .map((r) => ({
      id: r.id,
      date: r.vdate || r.date || "",
      vehicle_id: r.vehicle_id || "Not Assigned",
      staff_name: r.staff_name || r.assigned_to || "",
      route: r.route || r.area || "",
      shift: r.shift || "-",
      status: r.status || "",
      task_id: r.task_id || "-",
      pick_id: r.pick_id || "-",
      task_type: r.task_type || ""
    }));

  const needle = String(q || "").toLowerCase().trim();

  if (needle) {
    result = result.filter((r) =>
      `${r.vehicle_id} ${r.staff_name} ${r.route} ${r.shift} ${r.status} ${r.task_id} ${r.pick_id} ${r.task_type}`
        .toLowerCase()
        .includes(needle)
    );
  }

  return result;
};

/* ---------------- CREATE TRIP LOG ---------------- */

exports.createTripLog = async (body, user) => {
  const logDate = normalizeDate(body.date || body.vdate);
  const assignedTo = escText(body.assigned_to) || null;
  const inputStatus = escText(body.status) || "Assigned";
  const staffName =
    escText(body.staff_name) ||
    (assignedTo ? await getStaffDisplayName(assignedTo) : "");

  const payload = {
    assigned_to: assignedTo,
    task_type: escText(body.task_type) || "TRIP",

    // keep both date fields for compatibility
    date: logDate,
    vdate: logDate,

    vehicle_id: escText(body.vehicle_id) || "Not Assigned",
    staff_name: staffName,
    route: escText(body.route),
    area: escText(body.route),
    shift: escText(body.shift) || "Morning",
    status: inputStatus,

    task_id: ensureUuid(body.task_id),
    pick_id: ensureUuid(body.pick_id),

    created_by: user?.id || null
  };

  if (isCompletedStatus(inputStatus)) {
    payload.completed_at = new Date().toISOString();
  }

  if (!payload.assigned_to) throw new Error("Please select staff");
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
  const cleanStatus = escText(status);
  if (!cleanStatus) throw new Error("Status is required");

  const payload = {
    status: cleanStatus
  };

  if (isCompletedStatus(cleanStatus)) {
    payload.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("staff_tasks")
    .update(payload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

/* ---------------- CREATE MANUAL TASK ---------------- */

exports.createManualTask = async (body, user) => {
  const assigned_to = escText(body.assigned_to);
  const task_type = escText(body.task_type) || "Pickup";
  const route = escText(body.route || body.area);
  const vehicle_id = escText(body.vehicle_id) || "Not Assigned";
  const due_date = normalizeDate(body.due_date || body.date);
  const shift = escText(body.shift) || "Morning";
  const status = "Assigned";

  if (!assigned_to) throw new Error("Please select staff");
  if (!route) throw new Error("Please enter route");

  const staffDisplayName = await getStaffDisplayName(assigned_to);

  const payload = {
    assigned_to,
    task_type,

    // keep both date fields for compatibility
    date: due_date,
    vdate: due_date,

    vehicle_id,
    route,
    area: route,
    shift,
    status,
    staff_name: staffDisplayName,

    task_id: ensureUuid(body.task_id),
    pick_id: ensureUuid(body.pick_id),

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