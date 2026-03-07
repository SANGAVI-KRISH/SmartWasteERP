import { apiGet, apiPost, apiPatch } from "./apiClient.js";

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

async function loadAssignableStaff() {
  const sel = $("manualAssignTo");
  if (!sel) return;

  const res = await apiGet("/api/staff-vehicle/staff");
  if (!res.ok) {
    sel.innerHTML = `<option value="">Failed to load staff</option>`;
    return;
  }

  const rows = res.data || [];
  sel.innerHTML = `<option value="">-- Select Staff --</option>` +
    rows.map(u => {
      const label = `${u.name || u.full_name || u.email} (${u.role})`;
      return `<option value="${esc(u.id)}">${esc(label)}</option>`;
    }).join("");
}

async function loadTrips() {
  const q = ($("searchTrips")?.value || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const res = await apiGet(`/api/staff-vehicle/logs?${params.toString()}`);
  if (!res.ok) {
    $("tripsBody").innerHTML = `<tr><td colspan="8" style="opacity:.8;">${esc(res.message || "Failed to load logs")}</td></tr>`;
    return [];
  }

  return res.data || [];
}

function renderTripsRows(rows) {
  const body = $("tripsBody");
  const role = getRole();

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" style="opacity:.8;">No logs found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const isAdmin = role === "admin";
    let actionHtml = `<span style="opacity:.65;">-</span>`;

    if (isAdmin && String(r.status || "").toLowerCase() !== "completed") {
      actionHtml = `<button class="btn" data-complete="${esc(r.id)}">Mark Completed</button>`;
    }

    return `
      <tr>
        <td>${esc(r.date || "-")}</td>
        <td>${esc(r.vehicle_id || "-")}</td>
        <td>${esc(r.staff_name || "-")}</td>
        <td>${esc(r.route || "-")}</td>
        <td>${esc(r.shift || "-")}</td>
        <td>${esc(r.status || "-")}</td>
        <td>${esc(r.task_id || "-")}</td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("[data-complete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-complete");
      await markTripCompleted(id);
    });
  });
}

async function renderTrips() {
  const rows = await loadTrips();
  renderTripsRows(rows);
}

async function markTripCompleted(id) {
  const res = await apiPatch(`/api/staff-vehicle/logs/${id}/status`, {
    status: "Completed"
  });

  if (!res.ok) {
    toast(res.message || "Failed to update status", false);
    return;
  }

  toast("Trip marked completed");
  await renderTrips();
}

async function saveTripLog() {
  const payload = {
    date: $("vdate")?.value || todayISO(),
    vehicle_id: ($("vehicleId")?.value || "").trim(),
    staff_name: ($("staffName")?.value || "").trim(),
    route: ($("route")?.value || "").trim(),
    shift: ($("shift")?.value || "").trim(),
    status: ($("tripStatus")?.value || "").trim(),
    task_id: ($("taskId")?.value || "").trim() || null
  };

  if (!payload.vehicle_id) return toast("Vehicle ID is required", false);
  if (!payload.staff_name) return toast("Staff Name is required", false);
  if (!payload.route) return toast("Assigned Area / Route is required", false);

  const res = await apiPost("/api/staff-vehicle/logs", payload);
  if (!res.ok) {
    return toast(res.message || "Failed to save log", false);
  }

  toast("Trip log saved");
  await renderTrips();
}

async function createManualTask() {
  const payload = {
    assigned_to: ($("manualAssignTo")?.value || "").trim(),
    task_type: ($("manualTaskType")?.value || "").trim(),
    bin_id: ($("manualBinId")?.value || "").trim() || null,
    route: ($("manualRoute")?.value || "").trim(),
    vehicle_id: ($("manualVehicleId")?.value || "").trim() || null,
    priority: ($("manualPriority")?.value || "").trim(),
    due_date: ($("manualDueDate")?.value || "").trim() || null,
    notes: ($("manualNotes")?.value || "").trim() || null
  };

  if (!payload.assigned_to) return toast("Please select staff", false);
  if (!payload.route) return toast("Please enter route", false);

  const res = await apiPost("/api/staff-vehicle/manual-task", payload);
  if (!res.ok) {
    return toast(res.message || "Failed to create manual task", false);
  }

  toast("Manual task created and assigned");
  await renderTrips();
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
  set("manualBinId", "");
  set("manualRoute", "");
  set("manualVehicleId", "");
  set("manualPriority", "normal");
  set("manualNotes", "");
  set("manualDueDate", todayISO());
}

window.addEventListener("DOMContentLoaded", async () => {
  if ($("vdate") && !$("vdate").value) $("vdate").value = todayISO();
  if ($("manualDueDate") && !$("manualDueDate").value) $("manualDueDate").value = todayISO();

  initAdminManualTaskUI();

  if (getRole() === "admin") {
    await loadAssignableStaff();
  }

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