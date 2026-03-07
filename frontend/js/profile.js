import { apiGet, apiPatch } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
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

function setMsg(msg = "") {
  const el = $("msg");
  if (el) el.textContent = msg;
}

function setVal(id, value) {
  const el = $(id);
  if (el) el.value = value ?? "";
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("session");
    localStorage.removeItem("smartwaste_session");
    localStorage.removeItem("cloudcrafter_session");
  } catch {}
  window.location.href = "index.html";
}

function applyRoleVisibility(role) {
  role = String(role || "").toLowerCase();

  // hide everything first
  document.querySelectorAll(
    ".nav-admin, .nav-worker, .nav-driver, .nav-recycling"
  ).forEach((el) => {
    el.style.display = "none";
  });

  if (role === "admin") {
    document.querySelectorAll(
      ".nav-admin, .nav-worker, .nav-driver, .nav-recycling"
    ).forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "worker") {
    document.querySelectorAll(".nav-worker").forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "driver") {
    document.querySelectorAll(".nav-driver").forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "recycling_manager") {
    document.querySelectorAll(".nav-recycling").forEach((el) => {
      el.style.display = "";
    });
  }

  // always visible
  document.querySelectorAll(".nav-all").forEach((el) => {
    el.style.display = "";
  });
}

function formatMoney(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function formatPaidAt(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function setSalaryFallback(statusText = "Not Available") {
  setVal("salaryMonth", "-");
  setVal("salaryKg", "0");
  setVal("salaryRate", "0");
  setVal("salaryAmount", "0");
  setVal("salaryStatus", statusText);
  setVal("salaryPaidAt", "-");
}

async function loadProfile() {
  const res = await apiGet("/api/profile/me");

  if (!res.ok) {
    toast(res.message || "Failed to load profile", false);
    return null;
  }

  const p = res.data || {};

  setVal("profileName", p.name || "");
  setVal("profileEmail", p.email || "");
  setVal("profileRole", p.role || "");
  setVal("profileArea", p.area || "");

  applyRoleVisibility(p.role || "");
  return p;
}

async function loadMySalary(profile) {
  try {
    const role = String(profile?.role || "").toLowerCase();

    // Salary section mainly for worker/driver. Still safe to show fallback for others.
    if (!["worker", "driver"].includes(role)) {
      setSalaryFallback("Not Applicable");
      return;
    }

    const res = await apiGet("/api/salary/my");

    if (!res.ok) {
      setSalaryFallback("Pending");
      return;
    }

    const row = res.data || {};

    setVal("salaryMonth", row.month || "-");
    setVal("salaryKg", row.total_kg ?? 0);
    setVal("salaryRate", formatMoney(row.rate ?? 0));
    setVal("salaryAmount", formatMoney(row.salary ?? 0));
    setVal("salaryStatus", row.status || "Pending");
    setVal("salaryPaidAt", formatPaidAt(row.paid_at));
  } catch (err) {
    console.error("loadMySalary error:", err);
    setSalaryFallback("Pending");
  }
}

async function changePassword() {
  const np = $("newPassword")?.value || "";
  const cp = $("confirmNewPassword")?.value || "";

  if (!np || np.length < 6) {
    setMsg("Password must be at least 6 characters");
    toast("Password must be at least 6 characters", false);
    return;
  }

  if (np !== cp) {
    setMsg("Passwords do not match");
    toast("Passwords do not match", false);
    return;
  }

  setMsg("");

  const btn = $("updatePasswordBtn");
  const oldText = btn?.textContent || "Update Password";

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Updating...";
  }

  try {
    const res = await apiPatch("/api/profile/password", {
      newPassword: np
    });

    if (!res.ok) {
      setMsg(res.message || "Failed to update password");
      toast(res.message || "Failed to update password", false);
      return;
    }

    setVal("newPassword", "");
    setVal("confirmNewPassword", "");

    setMsg("");
    toast("Password updated ✅");
  } catch (err) {
    console.error("changePassword error:", err);
    setMsg("Failed to update password");
    toast("Failed to update password", false);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  $("updatePasswordBtn")?.addEventListener("click", changePassword);

  const profile = await loadProfile();
  await loadMySalary(profile);
});