import { apiGet, apiPost } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getRole() {
  return (localStorage.getItem("role") || "").toLowerCase();
}

function toast(msg, ok = true) {
  const t = $("toast");
  if (!t) return alert(msg);

  t.textContent = msg;
  t.style.display = "block";
  t.style.borderColor = ok ? "" : "rgba(255,80,80,.55)";
  t.style.background = ok ? "" : "rgba(255,80,80,.12)";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "index.html";
}

function normalizeStatus(v) {
  return String(v || "").trim().toUpperCase();
}

async function loadAssignableStaff() {
  const adminSel = $("manualAssignTo");
  const tripSel = $("staffName");
  const role = getRole();

  if (adminSel) adminSel.innerHTML = `<option value="">Loading staff...</option>`;
  if (tripSel) tripSel.innerHTML = `<option value="">Loading staff...</option>`;

  const tripRes = await apiGet("/api/staff-vehicle/staff");

  if (!tripRes.ok && role === "admin") {
    if (adminSel) adminSel.innerHTML = `<option value="">Failed to load staff</option>`;
    if (tripSel) tripSel.innerHTML = `<option value="">Failed to load staff</option>`;
    return;
  }

  const rows = tripRes.data || [];

  if (adminSel) {
    if (role === "admin") {
      adminSel.innerHTML =
        `<option value="">-- Select Staff --</option>` +
        rows
          .map((u) => {
            const label = `${u.name || u.full_name || u.email} (${u.role})`;
            return `<option value="${esc(u.id)}">${esc(label)}</option>`;
          })
          .join("");
    } else {
      adminSel.innerHTML = `<option value="">Admin only</option>`;
    }
  }

  if (tripSel) {
    if (rows.length) {
      tripSel.innerHTML =
        `<option value="">-- Select Staff --</option>` +
        rows
          .map((u) => {
            const label = `${u.name || u.full_name || u.email}`;
            return `<option value="${esc(u.id)}">${esc(label)}</option>`;
          })
          .join("");
    } else {
      tripSel.innerHTML = `<option value="">No staff available</option>`;
    }
  }
}

async function loadTrips() {
  const q = ($("searchTrips")?.value || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const qs = params.toString();
  const url = qs ? `/api/staff-vehicle/logs?${qs}` : `/api/staff-vehicle/logs`;

  const res = await apiGet(url);

  if (!res.ok) {
    $("tripsBody").innerHTML = `<tr><td colspan="7" style="opacity:.8;">${esc(
      res.message || "Failed to load logs"
    )}</td></tr>`;
    return [];
  }

  return res.data || [];
}

function renderTripsRows(rows) {
  const body = $("tripsBody");
  let visibleRows = rows || [];

  visibleRows = visibleRows.filter(
    (r) => normalizeStatus(r.status) !== "COMPLETED"
  );

  if (!visibleRows.length) {
    body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">No logs found.</td></tr>`;
    return;
  }

  body.innerHTML = visibleRows
    .map((r) => {
      return `
        <tr>
          <td>${esc(r.date || "-")}</td>
          <td>${esc(r.vehicle_id || "-")}</td>
          <td>${esc(r.staff_name || "-")}</td>
          <td>${esc(r.route || "-")}</td>
          <td>${esc(r.shift || "-")}</td>
          <td>${esc(r.status || "-")}</td>
          <td>${esc(r.task_id || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

async function renderTrips() {
  const rows = await loadTrips();
  renderTripsRows(rows);
}

async function saveTripLog() {
  const staffSel = $("staffName");
  const selectedOption = staffSel?.options?.[staffSel.selectedIndex];
  const selectedText = (selectedOption?.text || "").trim();

  const payload = {
    date: $("vdate")?.value || todayISO(),
    vehicle_id: ($("vehicleId")?.value || "").trim() || null,
    assigned_to: (staffSel?.value || "").trim(),
    staff_name: selectedText,
    route: ($("route")?.value || "").trim(),
    shift: ($("shift")?.value || "").trim() || "Morning",
    status: ($("tripStatus")?.value || "").trim() || "Assigned",
    task_id: ($("taskId")?.value || "").trim() || null,
    task_type: "TRIP"
  };

  if (!payload.assigned_to) {
    return toast("Please select staff", false);
  }
  if (!payload.route) {
    return toast("Assigned Area / Route is required", false);
  }

  const res = await apiPost("/api/staff-vehicle/logs", payload);
  if (!res.ok) {
    return toast(res.message || "Failed to save log", false);
  }

  toast("Trip log saved");
  await renderTrips();

  ["vehicleId", "route", "taskId"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });

  if ($("staffName")) $("staffName").value = "";
  if ($("shift")) $("shift").value = "Morning";
  if ($("tripStatus")) $("tripStatus").value = "Assigned";
  if ($("vdate")) $("vdate").value = todayISO();
}

async function createManualTask() {
  const payload = {
    assigned_to: ($("manualAssignTo")?.value || "").trim(),
    task_type: ($("manualTaskType")?.value || "").trim(),
    route: ($("manualRoute")?.value || "").trim(),
    vehicle_id: ($("manualVehicleId")?.value || "").trim() || null,
    shift: ($("manualShift")?.value || "").trim() || "Morning",
    priority: ($("manualPriority")?.value || "").trim(),
    due_date: ($("manualDueDate")?.value || "").trim() || todayISO(),
    notes: ($("manualNotes")?.value || "").trim() || null
  };

  if (!payload.assigned_to) {
    return toast("Please select staff", false);
  }
  if (!payload.route) {
    return toast("Please enter route", false);
  }

  const btn = $("btnCreateManualTask");
  if (btn) btn.disabled = true;

  try {
    const res = await apiPost("/api/staff-vehicle/manual-task", payload);

    if (!res.ok) {
      return toast(res.message || "Failed to create manual task", false);
    }

    toast("Manual task created and assigned");
    clearManualTaskForm();
    await renderTrips();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initAdminManualTaskUI() {
  const role = getRole();
  const card = $("adminManualTaskCard");
  if (!card) return;
  card.style.display = role === "admin" ? "block" : "none";
}

function clearManualTaskForm() {
  const set = (id, v = "") => {
    const el = $(id);
    if (el) el.value = v;
  };

  set("manualAssignTo", "");
  set("manualTaskType", "pickup");
  set("manualRoute", "");
  set("manualVehicleId", "");
  set("manualShift", "Morning");
  set("manualPriority", "normal");
  set("manualNotes", "");
  set("manualDueDate", todayISO());
}

window.addEventListener("DOMContentLoaded", async () => {
  if ($("vdate") && !$("vdate").value) $("vdate").value = todayISO();
  if ($("manualDueDate") && !$("manualDueDate").value) $("manualDueDate").value = todayISO();

  await loadAssignableStaff();
  initAdminManualTaskUI();
  await renderTrips();

  $("goCollectionBtn")?.addEventListener("click", () => {
    window.location.href = "collection.html";
  });

  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  $("btnClearManualTask")?.addEventListener("click", clearManualTaskForm);

  $("btnCreateManualTask")?.addEventListener("click", async () => {
    await createManualTask();
  });

  $("saveTripBtn")?.addEventListener("click", async () => {
    await saveTripLog();
  });

  $("searchTrips")?.addEventListener("input", renderTrips);
});