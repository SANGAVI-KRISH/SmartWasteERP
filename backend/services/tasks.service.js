const supabase = require("../config/supabase");

function roleOf(user) {
  return String(user?.role || "").toLowerCase();
}

function matchesQuery(row, q) {
  const blob = `${row.taskLabel} ${row.details} ${row.taskId} ${row.status}`.toLowerCase();
  return blob.includes(String(q || "").toLowerCase().trim());
}

async function getBinStatusMap(binIds) {
  const ids = [...new Set((binIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("bins")
    .select("bin_id,status")
    .in("bin_id", ids);

  if (error) {
    console.warn("getBinStatusMap error:", error.message);
    return {};
  }

  const map = {};
  (data || []).forEach((b) => {
    map[b.bin_id] = b.status || "-";
  });
  return map;
}

exports.getMyTasks = async (user, query) => {
  const role = roleOf(user);
  const userId = user?.id || user?.userId;
  const q = String(query?.q || "").trim();

  console.log("getMyTasks user:", { userId, role });

  let pickupQuery = supabase
    .from("pickup_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (role === "worker") {
    pickupQuery = pickupQuery.or(
      `assigned_worker_id.eq.${userId},assigned_to.eq.${userId}`
    );
  } else if (role === "driver") {
    pickupQuery = pickupQuery.or(
      `assigned_driver_id.eq.${userId},assigned_to.eq.${userId}`
    );
  }

  const { data: pickup, error: pErr } = await pickupQuery;
  if (pErr) {
    console.error("pickupQuery error:", pErr);
    throw new Error(pErr.message);
  }

  let staffQuery = supabase
    .from("staff_tasks")
    .select("id,task_type,date,vehicle_id,route,shift,status,created_at,completed_at,assigned_to")
    .order("created_at", { ascending: false });

  if (role !== "admin") {
    staffQuery = staffQuery.eq("assigned_to", userId);
  }

  const { data: staffTasks, error: sErr } = await staffQuery;
  if (sErr) {
    console.error("staffQuery error:", sErr);
    throw new Error(sErr.message);
  }

  console.log("pickup raw:", pickup);
  console.log("staff raw:", staffTasks);

  const binStatusMap = await getBinStatusMap((pickup || []).map((t) => t.bin_id));

  const pickupRows = (pickup || [])
    .filter((t) => {
      const taskStatus = String(t.status || "").trim().toUpperCase();
      const binStatus = String(binStatusMap[t.bin_id] || "").trim().toUpperCase();

      // hide if task already completed
      if (taskStatus === "COLLECTED") return false;
      if (taskStatus === "RECYCLED") return false;

      // hide if bin is already empty (work effectively completed / stale task)
      if (binStatus === "EMPTY") return false;

      return true;
    })
    .map((t) => {
      const bStatus = binStatusMap[t.bin_id] || "-";
      return {
        kind: "PICKUP",
        taskLabel: `Bin: ${t.bin_id || "-"}`,
        details: `Area: ${t.area || "-"} | Bin Status: ${bStatus}`,
        taskId: t.id || "",
        status: String(t.status || "OPEN").trim(),
        raw: t,
      };
    });

  const tripRows = (staffTasks || [])
    .filter((t) => String(t.task_type || "").trim().toUpperCase() === "TRIP")
    .filter((t) => String(t.status || "").trim().toUpperCase() !== "COMPLETED")
    .map((t) => ({
      kind: "TRIP",
      taskLabel: `Trip: ${t.vehicle_id || "-"}`,
      details: `${t.route || "-"} | ${t.shift || "-"} | ${t.date || "-"}`,
      taskId: t.id || "",
      status: String(t.status || "Assigned").trim(),
      raw: t,
    }));

  let rows = [...tripRows, ...pickupRows];

  if (q) {
    rows = rows.filter((r) => matchesQuery(r, q));
  }

  console.log("rows returned:", rows);
  return rows;
};

exports.updatePickupTaskStatus = async (id, status, user) => {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const allowed = ["OPEN", "COLLECTED", "DELIVERED", "RECEIVED", "RECYCLED"];

  if (!allowed.includes(normalizedStatus)) {
    throw new Error("Invalid pickup task status");
  }

  const payload = {
    status: normalizedStatus,
  };

  if (normalizedStatus === "COLLECTED") {
    payload.collected_at = new Date().toISOString();

    const { data: taskRow } = await supabase
      .from("pickup_tasks")
      .select("bin_id")
      .eq("id", id)
      .maybeSingle();

    if (taskRow?.bin_id) {
      const { error: binErr } = await supabase
        .from("bins")
        .update({
          status: "Empty",
          updated_at: new Date().toISOString()
        })
        .eq("bin_id", taskRow.bin_id);

      if (binErr) {
        console.warn("bins update warning:", binErr.message);
      }
    }
  }

  if (normalizedStatus === "DELIVERED") {
    payload.delivered_at = new Date().toISOString();
  }

  if (normalizedStatus === "RECEIVED") {
    payload.received_at = new Date().toISOString();
  }

  if (normalizedStatus === "RECYCLED") {
    payload.recycled_at = new Date().toISOString();
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