import { apiGet, apiPost, apiPatch, apiDelete } from "./apiClient.js";

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
  localStorage.removeItem("user");
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

function normalizeMessage(res, fallback) {
  if (!res) return fallback;
  if (typeof res.message === "string" && res.message.trim()) return res.message.trim();
  if (typeof res.error === "string" && res.error.trim()) return res.error.trim();
  return fallback;
}

async function fetchComplaints(q = "") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);

  const url = params.toString()
    ? `/api/complaints?${params.toString()}`
    : "/api/complaints";

  return await apiGet(url);
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

  const btn = $("submitComplaintBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }

  try {
    const res = await apiPost("/api/complaints", payload);

    if (!res?.ok) {
      return toast(normalizeMessage(res, "Failed to submit complaint."), false);
    }

    if ($("cname")) $("cname").value = "";
    if ($("carea")) $("carea").value = "";
    if ($("cissue")) $("cissue").value = "";
    if ($("cpriority")) $("cpriority").value = "Low";

    toast("Complaint submitted ✅");
    await renderComplaints();
  } catch (err) {
    console.error("Create complaint error:", err);
    toast("Something went wrong while submitting complaint.", false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Submit Complaint";
    }
  }
}

async function renderComplaints() {
  const body = $("complaintsBody");
  if (!body) return;

  const q = ($("searchComplaints")?.value || "").trim();

  body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">Loading complaints...</td></tr>`;

  try {
    const res = await fetchComplaints(q);

    if (!res?.ok) {
      body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">${esc(normalizeMessage(res, "Failed to load complaints."))}</td></tr>`;
      return;
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    const role = getRole();

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">No complaints found.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map((r) => {
      const canResolve = role === "admin";
      const currentStatus = String(r.status || "Pending");
      const isResolved = currentStatus.toLowerCase() === "resolved";

      let actions = `<span style="opacity:.65;">-</span>`;

      if (canResolve) {
        if (isResolved) {
          actions = `
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn" disabled style="opacity:.75; cursor:not-allowed;">Resolved</button>
              <button type="button" class="btn red" data-delete="${esc(r.id)}">Delete</button>
            </div>
          `;
        } else {
          actions = `<button type="button" class="btn" data-resolve="${esc(r.id)}">Mark Resolved</button>`;
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
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const id = btn.getAttribute("data-resolve");
        await markComplaintResolved(id, btn);
      });
    });

    body.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const id = btn.getAttribute("data-delete");
        await deleteComplaint(id, btn);
      });
    });
  } catch (err) {
    console.error("Render complaints error:", err);
    body.innerHTML = `<tr><td colspan="7" style="opacity:.8;">Failed to load complaints.</td></tr>`;
  }
}

async function markComplaintResolved(id, btn) {
  if (!id) return;

  const role = getRole();
  if (role !== "admin") {
    toast("Only admin can resolve complaints.", false);
    return;
  }

  const oldText = btn?.textContent || "Mark Resolved";

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Updating...";
  }

  try {
    const res = await apiPatch(`/api/complaints/${id}/status`, {
      status: "Resolved"
    });

    if (!res?.ok) {
      const msg = normalizeMessage(res, "Failed to update complaint.");

      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }

      console.error("Complaint update failed:", res);

      if (
        msg.toLowerCase().includes("unauthorized") ||
        msg.toLowerCase().includes("forbidden") ||
        msg.toLowerCase().includes("token") ||
        msg.toLowerCase().includes("jwt")
      ) {
        return toast("Update blocked. Please check admin token/login on backend.", false);
      }

      return toast(msg, false);
    }

    toast("Complaint resolved ✅");
    await renderComplaints();
  } catch (err) {
    console.error("Complaint resolve error:", err);

    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }

    toast("Server error while updating complaint.", false);
  }
}

async function deleteComplaint(id, btn) {
  if (!id) {
    toast("Invalid complaint id.", false);
    return;
  }

  const role = getRole();
  if (role !== "admin") {
    toast("Only admin can delete complaints.", false);
    return;
  }

  const confirmed = window.confirm("Delete this resolved complaint?");
  if (!confirmed) return;

  const oldText = btn?.textContent || "Delete";

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
  }

  try {
    console.log("Deleting complaint id:", id);

    const res = await apiDelete(`/api/complaints/${id}`);
    console.log("Delete response:", res);

    if (!res?.ok) {
      const msg = normalizeMessage(res, "Failed to delete complaint.");

      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }

      console.error("Complaint delete failed:", res);
      return toast(msg, false);
    }

    await renderComplaints();

    const searchValue = ($("searchComplaints")?.value || "").trim();
    const refreshed = await fetchComplaints(searchValue);

    if (!refreshed?.ok) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
      return toast("Delete response received, but refresh failed.", false);
    }

    const rows = Array.isArray(refreshed.data) ? refreshed.data : [];
    const stillExists = rows.some((row) => String(row.id) === String(id));

    if (stillExists) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }
      console.error("Complaint still exists after delete:", id, rows);
      return toast("Complaint was not actually deleted. Check backend delete API.", false);
    }

    toast("Complaint deleted ✅");
    await renderComplaints();
  } catch (err) {
    console.error("Complaint delete error:", err);

    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }

    toast("Server error while deleting complaint.", false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  $("submitComplaintBtn")?.addEventListener("click", createComplaint);
  $("searchComplaints")?.addEventListener("input", renderComplaints);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  await renderComplaints();
});