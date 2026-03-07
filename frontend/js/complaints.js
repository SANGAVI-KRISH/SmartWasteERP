import { apiGet, apiPost, apiPatch } from "./apiClient.js";

const $ = (id) => document.getElementById(id);

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
  clearTimeout(window.__complaintToastTimer);
  window.__complaintToastTimer = setTimeout(() => {
    el.style.display = "none";
  }, 2200);
}

function safeLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.href = "index.html";
}

function priorityBadge(priority) {
  const p = String(priority || "").toLowerCase();
  if (p === "high") return "badge red";
  if (p === "medium") return "badge amber";
  return "badge";
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "resolved" || s === "closed") return "badge";
  if (s === "in progress") return "badge amber";
  if (s === "pending" || s === "open") return "badge red";
  return "badge";
}

async function createComplaint() {
  const payload = {
    citizen_name: ($("cname")?.value || "").trim(),
    area: ($("carea")?.value || "").trim(),
    issue: ($("cissue")?.value || "").trim(),
    priority: ($("cpriority")?.value || "Low").trim()
  };

  if (!payload.citizen_name) return toast("Citizen name is required.", false);
  if (!payload.area) return toast("Area is required.", false);
  if (!payload.issue) return toast("Issue is required.", false);

  const res = await apiPost("/api/complaints", payload);
  if (!res.ok) {
    return toast(res.message || "Failed to submit complaint.", false);
  }

  if ($("cname")) $("cname").value = "";
  if ($("carea")) $("carea").value = "";
  if ($("cissue")) $("cissue").value = "";
  if ($("cpriority")) $("cpriority").value = "Low";

  toast("Complaint submitted ✅");
  await renderComplaints();
}

async function renderComplaints() {
  const body = $("complaintsBody");
  if (!body) return;

  const q = ($("searchComplaints")?.value || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const res = await apiGet(`/api/complaints?${params.toString()}`);
  if (!res.ok) {
    body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">${esc(res.message || "Failed to load complaints")}</td></tr>`;
    return;
  }

  const rows = res.data || [];
  const role = getRole();

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">No complaints found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => {
    const canResolve = role === "admin";
    const currentStatus = r.status || "Pending";

    let actions = `<span style="opacity:.65;">-</span>`;

    if (canResolve) {
      if (currentStatus.toLowerCase() === "resolved") {
        actions = `<button class="btn" disabled style="opacity:.75; cursor:not-allowed;">Resolved</button>`;
      } else {
        actions = `<button class="btn" data-resolve="${esc(r.id)}">Mark Resolved</button>`;
      }
    }

    const created = r.created_at ? new Date(r.created_at).toLocaleString() : "-";

    return `
      <tr>
        <td>${esc(created)}</td>
        <td>${esc(r.citizen_name || "-")}</td>
        <td>${esc(r.area || "-")}</td>
        <td>${esc(r.issue || "-")}</td>
        <td><span class="${priorityBadge(r.priority)}">${esc(r.priority || "-")}</span></td>
        <td><span class="${statusBadge(currentStatus)}">${esc(currentStatus)}</span></td>
        <td>${actions}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("[data-resolve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-resolve");
      await markComplaintResolved(id, btn);
    });
  });
}

async function markComplaintResolved(id, btn) {
  if (!id) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Updating...";
  }

  const res = await apiPatch(`/api/complaints/${id}/status`, {
    status: "Resolved"
  });

  if (!res.ok) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Mark Resolved";
    }
    console.error("Complaint update failed:", res);
    return toast(res.message || "Failed to update complaint.", false);
  }

  toast("Complaint resolved ✅");
  await renderComplaints();
}

window.addEventListener("DOMContentLoaded", async () => {
  $("submitComplaintBtn")?.addEventListener("click", createComplaint);
  $("searchComplaints")?.addEventListener("input", renderComplaints);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  await renderComplaints();
});