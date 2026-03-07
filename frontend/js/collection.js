import { apiGet, apiPost, apiDelete } from "./apiClient.js";

const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function getRole() {
  return (localStorage.getItem("role") || "").toLowerCase();
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(msg, ok = true) {
  const el = $("toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.style.display = "block";
  el.style.borderColor = ok ? "" : "rgba(255,80,80,.55)";
  el.style.background = ok ? "" : "rgba(255,80,80,.12)";
  clearTimeout(window.__t);
  window.__t = setTimeout(() => (el.style.display = "none"), 2200);
}

function pingBinsRefresh() {
  try { localStorage.setItem("bins_refresh_ping", String(Date.now())); } catch {}
  try { window.dispatchEvent(new Event("app:pickup_tasks_changed")); } catch {}
}

function applyEntryModeUI() {
  const mode = ($("entryMode")?.value || "task");
  const wrap = $("taskFieldsWrap");
  if (!wrap) return;

  if (mode === "manual") {
    wrap.style.display = "none";
    if ($("taskId")) $("taskId").value = "";
    if ($("staffTaskId")) $("staffTaskId").value = "";
  } else {
    wrap.style.display = "block";
  }
}

async function autofillFromUrl() {
  const sp = new URLSearchParams(window.location.search);

  const task_id = (sp.get("task_id") || "").trim();
  const staff_task_id = (sp.get("staff_task_id") || "").trim();
  const areaFromUrl = (sp.get("area") || "").trim();
  const binFromUrl = (sp.get("bin_id") || sp.get("binId") || "").trim();
  const vehicleFromUrl = (sp.get("vehicle_id") || sp.get("vehicleId") || "").trim();

  if (task_id && $("taskId")) $("taskId").value = task_id;
  if (staff_task_id && $("staffTaskId")) $("staffTaskId").value = staff_task_id;
  if (areaFromUrl && !$("area").value) $("area").value = areaFromUrl;
  if (binFromUrl && !$("binId").value) $("binId").value = binFromUrl;
  if (vehicleFromUrl && !$("vehicleId").value) $("vehicleId").value = vehicleFromUrl;

  if (task_id) {
    const res = await apiGet(`/api/collection/task-prefill?task_id=${encodeURIComponent(task_id)}`);
    if (res.ok && res.data) {
      if ($("area") && !$("area").value && res.data.area) $("area").value = res.data.area;
      if ($("binId") && !$("binId").value && res.data.bin_id) $("binId").value = res.data.bin_id;
    }
  }

  if (staff_task_id) {
    const res = await apiGet(`/api/collection/staff-task-prefill?staff_task_id=${encodeURIComponent(staff_task_id)}`);
    if (res.ok && res.data) {
      if ($("area") && !$("area").value && res.data.route) $("area").value = res.data.route;
      if ($("vehicleId") && !$("vehicleId").value && res.data.vehicle_id) $("vehicleId").value = res.data.vehicle_id;
    }
  }

  if (task_id || staff_task_id) {
    $("entryMode").value = "task";
    applyEntryModeUI();
    toast("Auto-filled from task ✅");
  }
}

async function renderCollections() {
  const body = $("collectionsBody");
  const q = ($("searchCollections")?.value || "").trim();
  const showRecycled = !!$("showRecycledToggle")?.checked;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (showRecycled) params.set("showRecycled", "true");

  const res = await apiGet(`/api/collection?${params.toString()}`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="9" style="opacity:.85;">${esc(res.message || "Failed to load records")}</td></tr>`;
    return;
  }

  const rows = res.data || [];
  const canDelete = getRole() === "admin";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" style="opacity:.8;">No records found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const st = r.pickup_status || "";
    const badge = st === "RECYCLED"
      ? `<span style="padding:2px 8px; border-radius:999px; font-size:12px; background:rgba(0,0,0,.06);">RECYCLED</span>`
      : (st ? `<span style="opacity:.75; font-size:12px;">${esc(st)}</span>` : `<span style="opacity:.55;">-</span>`);

    return `
      <tr>
        <td>${esc(r.date ?? "-")}</td>
        <td>${esc(r.area ?? "-")}</td>
        <td>${esc(r.waste_type ?? "-")}</td>
        <td>${esc(r.quantity_kg ?? "-")}</td>
        <td>${esc(r.vehicle_id ?? "-")}</td>
        <td>${esc(r.bin_id ?? "-")}</td>
        <td style="max-width:220px; word-break:break-all;">
          ${esc(r.task_id ?? "-")} <div style="margin-top:4px;">${badge}</div>
        </td>
        <td style="max-width:220px; word-break:break-all;">${esc(r.staff_task_id ?? "-")}</td>
        <td>
          ${canDelete
            ? `<button class="btn red" style="padding:6px 10px;" data-del="${esc(r.id)}">Delete</button>`
            : `<span style="opacity:.65;">-</span>`}
        </td>
      </tr>
    `;
  }).join("");

  if (canDelete) {
    body.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", () => deleteCollection(btn.getAttribute("data-del")));
    });
  }
}

async function deleteCollection(id) {
  if (getRole() !== "admin") {
    return toast("Only admin can delete collection records.", false);
  }

  if (!confirm("Delete this record?")) return;

  const res = await apiDelete(`/api/collection/${id}`);
  if (!res.ok) {
    return toast("Delete failed: " + (res.message || "Unknown error"), false);
  }

  toast("Deleted ✅");
  await renderCollections();
  pingBinsRefresh();
}

async function saveCollection() {
  if (window.__savingCollection) return;
  window.__savingCollection = true;

  const btn = $("saveCollectionBtn");
  const oldText = btn.textContent;
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    const mode = ($("entryMode")?.value || "task");

    const payload = {
      date: $("date")?.value || todayISO(),
      area: ($("area")?.value || "").trim(),
      waste_type: $("type")?.value,
      quantity_kg: Number($("qty")?.value),
      vehicle_id: ($("vehicleId")?.value || "").trim() || null,
      bin_id: ($("binId")?.value || "").trim() || null,
      task_id: mode === "manual" ? null : (($("taskId")?.value || "").trim() || null),
      staff_task_id: mode === "manual" ? null : (($("staffTaskId")?.value || "").trim() || null)
    };

    if (!payload.area) {
      toast("Area is required.", false);
      return;
    }

    if (!Number.isFinite(payload.quantity_kg) || payload.quantity_kg <= 0) {
      toast("Quantity must be > 0.", false);
      return;
    }

    const res = await apiPost("/api/collection", payload);
    if (!res.ok) {
      toast("Save failed: " + (res.message || "Unknown error"), false);
      return;
    }

    toast("Collection saved ✅");
    if ($("qty")) $("qty").value = "";

    await renderCollections();
    pingBinsRefresh();
  } finally {
    window.__savingCollection = false;
    btn.textContent = oldText;
    btn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!$("date")?.value) $("date").value = todayISO();

  $("entryMode")?.addEventListener("change", applyEntryModeUI);
  $("saveCollectionBtn")?.addEventListener("click", saveCollection);
  $("goStaffVehicleBtn")?.addEventListener("click", () => (window.location.href = "staff_vehicle.html"));
  $("searchCollections")?.addEventListener("input", renderCollections);
  $("showRecycledToggle")?.addEventListener("change", renderCollections);

  $("logoutBtnTop")?.addEventListener("click", () => window.logout?.());
  $("logoutBtnSidebar")?.addEventListener("click", () => window.logout?.());

  applyEntryModeUI();
  await autofillFromUrl();
  await renderCollections();
});