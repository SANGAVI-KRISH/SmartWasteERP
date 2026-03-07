const supabase = require("../config/supabase");

function roleOf(user) {
  return String(user?.role || "").toLowerCase();
}

function matchesQuery(row, q) {
  const blob = `${row.taskLabel} ${row.details} ${row.taskId} ${row.status}`.toLowerCase();
  return blob.includes(String(q || "").toLowerCase().trim());
}

function todayLocalYMD() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toYMD(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const d = new Date(value);
  if (isNaN(d.getTime())) return null;

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPickupCompleted(status) {
  const s = String(status || "").trim().toUpperCase();
  return ["COLLECTED", "RECYCLED", "DELIVERED", "RECEIVED", "COMPLETED"].includes(s);
}

function isTripCompleted(status) {
  return String(status || "").trim().toUpperCase() === "COMPLETED";
}

function shouldShowCompletedTask(dateValue) {
  return toYMD(dateValue) === todayLocalYMD();
}

async function getBinStatusMap(binIds) {
  const ids = [...new Set((binIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("bins")
    .select("bin_id,status,bin_status")
    .in("bin_id", ids);

  if (error) return {};

  const map = {};
  (data || []).forEach((b) => {
    map[b.bin_id] = b.status || b.bin_status || "-";
  });
  return map;
}

exports.getMyTasks = async (user, query) => {
  const role = roleOf(user);
  const userId = user?.id;
  const q = String(query.q || "").trim();

  let pickupQuery = supabase
    .from("pickup_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (role === "worker" || role === "driver") {
    pickupQuery = pickupQuery.or(
      `assigned_worker_id.eq.${userId},assigned_driver_id.eq.${userId},assigned_to.eq.${userId}`
    );
  }

  const { data: pickup, error: pErr } = await pickupQuery;
  if (pErr) throw new Error(pErr.message);

  const binStatusMap = await getBinStatusMap((pickup || []).map((t) => t.bin_id));

  let staffQuery = supabase
    .from("staff_tasks")
    .select("id,task_type,date,vehicle_id,route,shift,status,created_at,updated_at,completed_at,assigned_to,staff_id")
    .order("created_at", { ascending: false });

  if (role !== "admin") {
    staffQuery = staffQuery.or(`assigned_to.eq.${userId},staff_id.eq.${userId}`);
  }

  const { data: staffTasks, error: sErr } = await staffQuery;
  if (sErr) throw new Error(sErr.message);

  const pickupRows = (pickup || [])
    .filter((t) => {
      if (!isPickupCompleted(t.status)) return true;
      return shouldShowCompletedTask(
        t.completed_at || t.updated_at || t.created_at
      );
    })
    .map((t) => {
      const bStatus = binStatusMap[t.bin_id] || "-";
      return {
        kind: "PICKUP",
        taskLabel: `Bin: ${t.bin_id || "-"}`,
        details: `Area: ${t.area || "-"} | Bin Status: ${bStatus}`,
        taskId: t.id || "",
        status: t.status || "-",
        raw: t,
      };
    });

  const tripRows = (staffTasks || [])
    .filter((t) => String(t.task_type || "").toUpperCase() === "TRIP")
    .filter((t) => {
      if (!isTripCompleted(t.status)) return true;
      return shouldShowCompletedTask(
        t.completed_at || t.updated_at || t.date || t.created_at
      );
    })
    .map((t) => ({
      kind: "TRIP",
      taskLabel: `Trip: ${t.vehicle_id || "-"}`,
      details: `${t.route || "-"} | ${t.shift || "-"} | ${t.date || "-"}`,
      taskId: t.id || "",
      status: (t.status || "Assigned").trim(),
      raw: t,
    }));

  let rows = [...tripRows, ...pickupRows];

  if (q) {
    rows = rows.filter((r) => matchesQuery(r, q));
  }

  return rows;
};

exports.updatePickupTaskStatus = async (id, status, user) => {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const allowed = ["STARTED", "COLLECTED", "RECYCLED", "DELIVERED", "RECEIVED", "ASSIGNED", "OPEN"];

  if (!allowed.includes(normalizedStatus)) {
    throw new Error("Invalid pickup task status");
  }

  const payload = {
    status: normalizedStatus,
    updated_at: new Date().toISOString(),
  };

  if (isPickupCompleted(normalizedStatus)) {
    payload.completed_at = new Date().toISOString();
  } else {
    payload.completed_at = null;
  }

  const { data, error } = await supabase
    .from("pickup_tasks")
    .update(payload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
};

exports.updateTripTaskStatus = async (id, status, user) => {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const allowed = ["ASSIGNED", "STARTED", "COMPLETED"];

  if (!allowed.includes(normalizedStatus)) {
    throw new Error("Invalid trip task status");
  }

  let finalStatus = normalizedStatus;
  if (normalizedStatus === "ASSIGNED") finalStatus = "Assigned";
  if (normalizedStatus === "STARTED") finalStatus = "Started";
  if (normalizedStatus === "COMPLETED") finalStatus = "Completed";

  const payload = {
    status: finalStatus,
    updated_at: new Date().toISOString(),
  };

  if (normalizedStatus === "COMPLETED") {
    payload.completed_at = new Date().toISOString();
  } else {
    payload.completed_at = null;
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