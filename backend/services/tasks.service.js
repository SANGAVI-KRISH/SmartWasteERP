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

/* ---------------- GET MY TASKS ---------------- */

exports.getMyTasks = async (user, query) => {
  const role = roleOf(user);
  const userId = user?.id || user?.userId;
  const q = String(query?.q || "").trim();

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
    .select("id,task_type,date,vdate,vehicle_id,route,area,shift,status,created_at,completed_at,assigned_to,staff_name")
    .order("created_at", { ascending: false });

  if (role !== "admin") {
    staffQuery = staffQuery.eq("assigned_to", userId);
  }

  const { data: staffTasks, error: sErr } = await staffQuery;
  if (sErr) {
    console.error("staffQuery error:", sErr);
    throw new Error(sErr.message);
  }

  const binStatusMap = await getBinStatusMap((pickup || []).map((t) => t.bin_id));

  const pickupRows = (pickup || [])
    .filter((t) => {
      const taskStatus = String(t.status || "").trim().toUpperCase();
      const binStatus = String(binStatusMap[t.bin_id] || "").trim().toUpperCase();

      if (taskStatus === "COLLECTED") return false;
      if (taskStatus === "RECYCLED") return false;
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

  const staffRows = (staffTasks || [])
    .filter((t) => String(t.status || "").trim().toUpperCase() !== "COMPLETED")
    .map((t) => {
      const type = String(t.task_type || "TASK").trim();
      const upperType = type.toUpperCase();

      let taskLabel = "Task";
      let details = `${t.route || t.area || "-"} | ${t.shift || "Morning"} | ${t.vdate || t.date || "-"}`;

      if (upperType === "TRIP") {
        taskLabel = `Trip: ${t.vehicle_id || "-"}`;
        details = `${t.route || "-"} | ${t.shift || "-"} | ${t.vdate || t.date || "-"}`;
      } else if (upperType === "PICKUP") {
        taskLabel = "Pickup Task";
        details = `${t.route || t.area || "-"} | ${t.vehicle_id || "Not Assigned"} | ${t.vdate || t.date || "-"}`;
      } else if (upperType === "INSPECTION") {
        taskLabel = "Inspection Task";
        details = `${t.route || t.area || "-"} | ${t.vehicle_id || "Not Assigned"} | ${t.vdate || t.date || "-"}`;
      } else if (upperType === "MAINTENANCE") {
        taskLabel = "Maintenance Task";
        details = `${t.route || t.area || "-"} | ${t.vehicle_id || "Not Assigned"} | ${t.vdate || t.date || "-"}`;
      } else {
        taskLabel = type;
      }

      return {
        kind: upperType === "TRIP" ? "TRIP" : "STAFF_TASK",
        taskLabel,
        details,
        taskId: t.id || "",
        status: String(t.status || "Assigned").trim(),
        raw: t,
      };
    });

  let rows = [...staffRows, ...pickupRows];

  if (q) {
    rows = rows.filter((r) => matchesQuery(r, q));
  }

  return rows;
};

/* ---------------- UPDATE PICKUP TASK STATUS ---------------- */

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

/* ---------------- UPDATE STAFF/TRIP TASK STATUS ---------------- */

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

/* ---------------- COMPLETE STAFF TASK + SAVE COLLECTION ---------------- */

exports.completeStaffTaskWithCollection = async (id, body, user) => {
  const userId = user?.id || user?.userId;
  if (!id) throw new Error("Task ID is required");
  if (!userId) throw new Error("User not found");

  const quantityKg = Number(body?.quantity_kg);
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    throw new Error("Quantity must be greater than 0");
  }

  const wasteType = String(body?.waste_type || "Dry").trim();
  const allowedWasteTypes = ["Wet", "Dry", "Plastic"];
  if (!allowedWasteTypes.includes(wasteType)) {
    throw new Error("Invalid waste type");
  }

  const { data: taskRow, error: taskErr } = await supabase
    .from("staff_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (taskErr) throw new Error(taskErr.message);
  if (!taskRow) throw new Error("Task not found");

  const currentStatus = String(taskRow.status || "").trim().toUpperCase();
  if (currentStatus === "COMPLETED") {
    throw new Error("Task already completed");
  }

  const area = String(body?.area || taskRow.area || taskRow.route || "").trim();
  const date = String(body?.date || taskRow.vdate || taskRow.date || "").trim();
  const vehicleId = String(body?.vehicle_id || taskRow.vehicle_id || "").trim();

  if (!area) throw new Error("Area is required");
  if (!date) throw new Error("Date is required");

  const collectionPayload = {
    user_id: userId,
    date,
    area,
    waste_type: wasteType,
    quantity_kg: quantityKg,
    vehicle_id: vehicleId || null,
    staff_task_id: id
  };

  const { data: collectionRow, error: collectionErr } = await supabase
    .from("collection_records")
    .insert([collectionPayload])
    .select()
    .maybeSingle();

  if (collectionErr) throw new Error(collectionErr.message);

  const completedAt = new Date().toISOString();

  const { data: updatedTask, error: updateErr } = await supabase
    .from("staff_tasks")
    .update({
      status: "Completed",
      completed_at: completedAt
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateErr) throw new Error(updateErr.message);

  return {
    collection: collectionRow,
    task: updatedTask
  };
};