import { apiGet, apiPatch } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "index.html";
}

let USERS_CACHE = [];

function getRoleOrder(role) {
  const order = {
    admin: 1,
    recycling_manager: 2,
    worker: 3,
    driver: 4
  };
  return order[String(role || "").toLowerCase()] || 999;
}

function sortUsersByRole(users) {
  return [...users].sort((a, b) => {
    const roleDiff = getRoleOrder(a.role) - getRoleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;

    const nameA = String(a.name || a.email || "").toLowerCase();
    const nameB = String(b.name || b.email || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

async function loadUsers() {
  const res = await apiGet("/api/users");
  if (!res.ok) {
    $("usersBody").innerHTML = `<tr><td colspan="4" style="opacity:.8;">${esc(res.message || "Failed to load users")}</td></tr>`;
    return;
  }

  USERS_CACHE = sortUsersByRole(res.data || []);
  renderUsers();
}

function renderUsers() {
  const body = $("usersBody");
  const q = ($("searchUsers")?.value || "").trim().toLowerCase();

  let rows = [...USERS_CACHE];

  if (q) {
    rows = rows.filter(
      (u) =>
        `${u.email || ""} ${u.role || ""} ${u.area || ""} ${u.name || ""}`
          .toLowerCase()
          .includes(q)
    );
  }

  rows = sortUsersByRole(rows);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" style="opacity:.8;">No users found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      (u) => `
    <tr>
      <td>${esc(u.email || "-")}</td>
      <td>
        <select data-role="${esc(u.id)}">
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          <option value="recycling_manager" ${u.role === "recycling_manager" ? "selected" : ""}>Recycling Manager</option>
          <option value="worker" ${u.role === "worker" ? "selected" : ""}>Worker</option>
          <option value="driver" ${u.role === "driver" ? "selected" : ""}>Driver</option>
        </select>
      </td>
      <td>
        <input data-area="${esc(u.id)}" value="${esc(u.area || "")}" placeholder="Area" />
      </td>
      <td>
        <button class="btn" data-save="${esc(u.id)}">Save</button>
      </td>
    </tr>
  `
    )
    .join("");

  body.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-save");
      await saveUser(id);
    });
  });
}

async function saveUser(id) {
  const roleEl = document.querySelector(`[data-role="${CSS.escape(id)}"]`);
  const areaEl = document.querySelector(`[data-area="${CSS.escape(id)}"]`);

  const payload = {
    role: roleEl?.value || "",
    area: areaEl?.value?.trim() || ""
  };

  if (!payload.role) {
    toast("Role is required", false);
    return;
  }

  const res = await apiPatch(`/api/users/${id}`, payload);
  if (!res.ok) {
    toast(res.message || "Failed to update user", false);
    return;
  }

  toast("User updated ✅");
  await loadUsers();
}

window.addEventListener("DOMContentLoaded", async () => {
  $("searchUsers")?.addEventListener("input", renderUsers);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  await loadUsers();
});