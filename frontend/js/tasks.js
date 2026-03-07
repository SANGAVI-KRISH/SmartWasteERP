import { apiGet, apiPatch } from "./apiClient.js";

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
  window.__toastTimer = setTimeout(() => (t.style.display = "none"), 1800);
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

function pickupActionButton(task, role) {
  const status = String(task.status || "").trim();

  if (role === "admin") return `<span style="opacity:.65;">-</span>`;

  if (status === "OPEN" || status === "Assigned") {
    return `<button class="btn" data-pickup-start="${escapeHtml(task.id)}">Start</button>`;
  }

  if (status === "STARTED" || status === "In Progress") {
    return `<button class="btn" data-pickup-collected="${escapeHtml(task.id)}">Mark Collected</button>`;
  }

  if (status === "COLLECTED") {
    return `<button class="btn" disabled style="opacity:.75;">Collected</button>`;
  }

  if (status === "RECYCLED") {
    return `<button class="btn" disabled style="opacity:.75;">Recycled</button>`;
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
    toast(res.message || "Failed to update trip task");
    return false;
  }
  return true;
}

window.__tripToggle = async (id) => {
  try {
    if (!id) return;

    const tr = document.querySelector(`tr[data-trip-id="${CSS.escape(id)}"]`);
    const currentStatus = (tr?.getAttribute("data-status") || "Assigned").trim();

    if (currentStatus === "Assigned") {
      const ok = await updateStaffTaskStatus(id, "Started");
      if (!ok) return;
      await renderMyTasksTable();
      return;
    }

    if (currentStatus === "Started") {
      const ok = await updateStaffTaskStatus(id, "Completed");
      if (!ok) return;
      window.location = `collection.html?staff_task_id=${encodeURIComponent(id)}&mode=trip`;
      return;
    }

    toast("Already completed ✅");
  } catch (e) {
    console.log("trip toggle error:", e);
    toast("Error: " + (e?.message || e));
  }
};

async function loadTasks() {
  const q = ($("searchTasks")?.value || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const res = await apiGet(`/api/tasks?${params.toString()}`);
  if (!res.ok) {
    $("tasksBody").innerHTML = `<tr><td colspan="5" style="opacity:.85;">${escapeHtml(res.message || "Failed to load tasks")}</td></tr>`;
    return [];
  }

  return res.data || [];
}

async function renderMyTasksTable() {
  const tbody = $("tasksBody");
  const role = getRole();

  let rows = await loadTasks();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="opacity:.8;">No tasks found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    let action = r.kind === "PICKUP"
      ? pickupActionButton(r.raw || r, role)
      : (role !== "admin"
          ? (r.status === "Completed"
              ? "✅ Done"
              : `<button class="btn" onclick="__tripToggle('${escapeHtml(r.taskId)}')">${r.status === "Assigned" ? "Work Started" : "Work Completed"}</button>`)
          : `<span style="opacity:.65;">-</span>`);

    action = removeCollectionButton(action);

    return `
      <tr ${r.kind === "TRIP" ? `data-trip-id="${escapeHtml(r.taskId)}" data-status="${escapeHtml(r.status)}"` : ""}>
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

  tbody.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => copyToClipboard(btn.getAttribute("data-copy")));
  });

  tbody.querySelectorAll("[data-pickup-start]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pickup-start");
      const ok = await updatePickupStatus(id, "STARTED");
      if (ok) await renderMyTasksTable();
    });
  });

  tbody.querySelectorAll("[data-pickup-collected]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pickup-collected");
      window.location = `collection.html?task_id=${encodeURIComponent(id)}&mode=pickup`;
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

  $("searchTasks")?.addEventListener("input", () => renderMyTasksTable());

  $("refreshTasksBtn")?.addEventListener("click", async () => {
    await renderMyTasksTable();
    toast("Refreshed ✅");
  });

  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
});