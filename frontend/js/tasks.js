import { apiGet, apiPatch, apiPost } from "./apiClient.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRole() {
  return (localStorage.getItem("role") || "").toLowerCase();
}

function toast(msg) {
  const t = $("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

async function copyToClipboard(text) {
  const t = String(text || "");
  if (!t) return;

  try {
    await navigator.clipboard.writeText(t);
    toast("Copied ✅");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copied ✅");
  }
}

function removeCollectionButton(html) {
  if (!html) return html;
  return String(html)
    .replace(/<button\b[^>]*>\s*Collection\s*<\/button>\s*/gi, "")
    .trim();
}

function norm(s) {
  return String(s || "").trim().toUpperCase();
}

function getNextPickupStatus(currentStatus) {
  const s = norm(currentStatus);

  if (s === "OPEN" || s === "ASSIGNED") return "COLLECTED";
  if (s === "COLLECTED") return "DELIVERED";
  if (s === "DELIVERED") return "RECEIVED";
  if (s === "RECEIVED") return "RECYCLED";

  return null;
}

function getPickupActionLabel(currentStatus) {
  const s = norm(currentStatus);

  if (s === "OPEN" || s === "ASSIGNED") return "Mark Collected";
  if (s === "COLLECTED") return "Mark Delivered";
  if (s === "DELIVERED") return "Mark Received";
  if (s === "RECEIVED") return "Mark Recycled";
  if (s === "RECYCLED") return "Recycled";

  return "-";
}

function getNextTripStatus(currentStatus) {
  const s = norm(currentStatus);

  if (s === "ASSIGNED") return "Started";
  if (s === "STARTED") return "Completed";

  return null;
}

function getTripActionLabel(currentStatus) {
  const s = norm(currentStatus);

  if (s === "ASSIGNED") return "Work Started";
  if (s === "STARTED") return "Work Completed";
  if (s === "COMPLETED") return "Done";

  return "-";
}

function pickupActionButton(task, role) {
  const status = String(task.status || "").trim();

  if (role === "admin") return `<span style="opacity:.65;">-</span>`;

  const label = getPickupActionLabel(status);
  const nextStatus = getNextPickupStatus(status);
  const id = escapeHtml(task.id || task.taskId || "");

  if (!id) return `<span style="opacity:.65;">-</span>`;

  if (!nextStatus) {
    if (norm(status) === "RECYCLED") {
      return `<button class="btn" disabled style="opacity:.75;">Recycled</button>`;
    }
    return `<span style="opacity:.65;">-</span>`;
  }

  return `<button class="btn" data-pickup-action="${id}" data-next-status="${escapeHtml(nextStatus)}">${escapeHtml(label)}</button>`;
}

function staffTaskActionButton(task, role) {
  const status = String(task.status || "").trim();
  const id = escapeHtml(task.taskId || task.id || "");

  if (role === "admin") return `<span style="opacity:.65;">-</span>`;
  if (!id) return `<span style="opacity:.65;">-</span>`;

  const label = getTripActionLabel(status);
  const nextStatus = getNextTripStatus(status);

  if (!nextStatus) {
    if (norm(status) === "COMPLETED") {
      return `<button class="btn" disabled style="opacity:.75;">Done</button>`;
    }
    return `<span style="opacity:.65;">-</span>`;
  }

  if (norm(nextStatus) === "STARTED") {
    return `<button class="btn" data-staff-start="${id}">${escapeHtml(label)}</button>`;
  }

  if (norm(nextStatus) === "COMPLETED") {
    return `<button class="btn" data-staff-complete="${id}">${escapeHtml(label)}</button>`;
  }

  return `<span style="opacity:.65;">-</span>`;
}

async function updatePickupStatus(id, status) {
  const res = await apiPatch(`/api/tasks/pickup/${id}/status`, { status });
  if (!res.ok) {
    toast(res.message || "Failed to update pickup task");
    return false;
  }
  return true;
}

async function updateStaffTaskStatus(id, status) {
  const res = await apiPatch(`/api/tasks/trip/${id}/status`, { status });
  if (!res.ok) {
    toast(res.message || "Failed to update staff task");
    return false;
  }
  return true;
}

function askCollectedQuantity() {
  const input = prompt("Enter collected quantity in kg:");
  if (input == null) return null;

  const qty = Number(String(input).trim());
  if (!Number.isFinite(qty) || qty <= 0) {
    toast("Enter a valid quantity");
    return null;
  }

  return qty;
}

function askWasteType(defaultValue = "Dry") {
  const input = prompt("Enter waste type: Wet / Dry / Plastic", defaultValue);
  if (input == null) return null;

  const value = String(input || "").trim();
  const allowed = ["Wet", "Dry", "Plastic"];

  if (!allowed.includes(value)) {
    toast("Waste type must be Wet, Dry, or Plastic");
    return null;
  }

  return value;
}

/*
  Creates the collection entry automatically for pickup tasks.
  First tries /api/collection and then /api/collections.
*/
async function createCollectionEntryForPickup(task, quantityKg) {
  const payload = {
    task_id: task.taskId || task.id || "",
    staff_task_id: task.raw?.staff_task_id || null,
    bin_id: task.raw?.bin_id || task.raw?.binId || task.raw?.bin_code || "",
    area: task.raw?.area || "",
    quantity_kg: quantityKg,
    waste_type: task.raw?.waste_type || "Dry",
    date: new Date().toISOString().slice(0, 10)
  };

  let res = await apiPost("/api/collection", payload);
  if (res.ok) return res;

  res = await apiPost("/api/collections", payload);
  return res;
}

async function completeStaffTaskWithCollection(task) {
  const quantityKg = askCollectedQuantity();
  if (quantityKg == null) return false;

  const wasteType = askWasteType("Dry");
  if (wasteType == null) return false;

  const payload = {
    date:
      task?.raw?.vdate ||
      task?.raw?.date ||
      new Date().toISOString().slice(0, 10),

    area:
      task?.raw?.area ||
      task?.raw?.route ||
      "",

    vehicle_id:
      task?.raw?.vehicle_id || "",

    quantity_kg: quantityKg,
    waste_type: wasteType
  };

  const res = await apiPost(`/api/tasks/staff-task/${task.taskId}/complete`, payload);

  if (!res.ok) {
    toast(res.message || "Failed to complete task");
    return false;
  }

  return true;
}

async function loadTasks() {
  const q = ($("searchTasks")?.value || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const url = params.toString() ? `/api/tasks?${params.toString()}` : "/api/tasks";
  const res = await apiGet(url);

  if (!res.ok) {
    $("tasksBody").innerHTML = `<tr><td colspan="5" style="opacity:.85;">${escapeHtml(res.message || "Failed to load tasks")}</td></tr>`;
    return [];
  }

  return res.data || [];
}

async function renderMyTasksTable() {
  const tbody = $("tasksBody");
  const role = getRole();

  const rows = await loadTasks();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="opacity:.8;">No tasks found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    let action = "";

    if (r.kind === "PICKUP") {
      action = pickupActionButton(r.raw || r, role);
    } else {
      action = staffTaskActionButton(r, role);
    }

    action = removeCollectionButton(action);

    return `
      <tr
        ${r.kind !== "PICKUP" ? `data-staff-id="${escapeHtml(r.taskId)}" data-status="${escapeHtml(r.status)}"` : ""}
        ${r.kind === "PICKUP" ? `data-pickup-id="${escapeHtml(r.taskId)}" data-status="${escapeHtml(r.status)}"` : ""}
      >
        <td>${escapeHtml(r.taskLabel)}</td>
        <td>${escapeHtml(r.details)}</td>
        <td class="task-id">
          <div class="id-wrap">
            <span class="id-text" title="${escapeHtml(r.taskId)}">${escapeHtml(r.taskId)}</span>
            ${r.taskId ? `<button class="btn copy-btn" data-copy="${escapeHtml(r.taskId)}">Copy</button>` : ""}
          </div>
        </td>
        <td>${escapeHtml(r.status)}</td>
        <td class="task-actions">${action || "-"}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyToClipboard(btn.getAttribute("data-copy")));
  });

  tbody.querySelectorAll("[data-pickup-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pickup-action");
      const nextStatus = btn.getAttribute("data-next-status");
      const task = rows.find((r) => r.taskId === id);

      if (!id || !nextStatus) {
        toast("Invalid pickup task status");
        return;
      }

      if (!task) {
        toast("Task not found");
        return;
      }

      if (nextStatus === "COLLECTED") {
        const qty = askCollectedQuantity();
        if (qty == null) return;

        const collectionRes = await createCollectionEntryForPickup(task, qty);
        if (!collectionRes.ok) {
          toast(collectionRes.message || "Failed to create collection entry");
          return;
        }
      }

      const ok = await updatePickupStatus(id, nextStatus);
      if (!ok) return;

      if (nextStatus === "COLLECTED") {
        toast("Collection saved and task marked collected ✅");
      } else if (nextStatus === "DELIVERED") {
        toast("Task marked delivered ✅");
      } else if (nextStatus === "RECEIVED") {
        toast("Task marked received ✅");
      } else if (nextStatus === "RECYCLED") {
        toast("Task marked recycled ✅");
      } else {
        toast("Pickup task updated ✅");
      }

      await renderMyTasksTable();
    });
  });

  tbody.querySelectorAll("[data-staff-start]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-staff-start");
      if (!id) {
        toast("Invalid task");
        return;
      }

      const ok = await updateStaffTaskStatus(id, "STARTED");
      if (!ok) return;

      toast("Work started ✅");
      await renderMyTasksTable();
    });
  });

  tbody.querySelectorAll("[data-staff-complete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-staff-complete");
      const task = rows.find((r) => r.taskId === id);

      if (!id || !task) {
        toast("Task not found");
        return;
      }

      const ok = await completeStaffTaskWithCollection(task);
      if (!ok) return;

      toast("Collection saved and task completed ✅");
      await renderMyTasksTable();
    });
  });
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", async () => {
  await renderMyTasksTable();

  $("searchTasks")?.addEventListener("input", () => {
    renderMyTasksTable();
  });

  $("refreshTasksBtn")?.addEventListener("click", async () => {
    await renderMyTasksTable();
    toast("Refreshed ✅");
  });

  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
});