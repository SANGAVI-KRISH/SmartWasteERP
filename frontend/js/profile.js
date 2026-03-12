import { apiGet, apiPatch, getApiBase } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function getApiBaseUrl() {
  return getApiBase();
}

function toast(msg, ok = true) {
  const t = $("toast");
  if (!t) return alert(msg);

  t.textContent = msg;
  t.style.display = "block";
  t.style.borderColor = ok ? "" : "rgba(255,80,80,.55)";
  t.style.background = ok ? "" : "rgba(255,80,80,.12)";
  t.style.color = ok ? "" : "#ffd5d5";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

function setMsg(msg = "", ok = false) {
  const el = $("msg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "#7CFC98" : "#ff8a8a";
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

function monthName(value) {
  const map = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December"
  };

  const n = Number(value);
  if (map[n]) return map[n];

  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleString(undefined, { month: "long" });
  }

  return s || "-";
}

function resolveYear(row) {
  if (row?.year) return row.year;

  const s = String(row?.month || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) {
    return s.split("-")[0];
  }

  return "-";
}

function resolveMonth(row) {
  if (row?.month_name) return row.month_name;
  if (row?.month_num) return monthName(row.month_num);
  if (row?.month_no) return monthName(row.month_no);

  if (typeof row?.month === "number") return monthName(row.month);

  const s = String(row?.month || "").trim();

  if (/^\d{4}-\d{2}$/.test(s)) {
    return monthName(s);
  }

  if (/^\d{1,2}$/.test(s)) {
    return monthName(Number(s));
  }

  if (s) return s;

  return "-";
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getErrorMessage(res, fallback = "Something went wrong") {
  return res?.error || res?.message || fallback;
}

function getSalaryAmount(row) {
  if (row?.total_salary !== undefined && row?.total_salary !== null) {
    return row.total_salary;
  }
  if (row?.salary !== undefined && row?.salary !== null) {
    return row.salary;
  }
  return 0;
}

function getSalaryStatus(row) {
  return row?.status || "Pending";
}

function getSalaryPaidAt(row) {
  return row?.paid_at || row?.paidAt || null;
}

function setSalaryTableEmpty(message = "No salary records found") {
  const tbody = $("salaryHistoryBody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center;">${esc(message)}</td>
    </tr>
  `;

  setVal("salaryTotalRecords", "0");
}

function renderSalaryTable(rows) {
  const tbody = $("salaryHistoryBody");
  if (!tbody) return;

  const list = Array.isArray(rows) ? rows : [];
  setVal("salaryTotalRecords", String(list.length));

  if (!list.length) {
    setSalaryTableEmpty("No salary records found");
    return;
  }

  tbody.innerHTML = list
    .map((row) => {
      return `
        <tr>
          <td>${esc(resolveMonth(row))}</td>
          <td>${esc(resolveYear(row))}</td>
          <td>${esc(formatMoney(getSalaryAmount(row)))}</td>
          <td>${esc(getSalaryStatus(row))}</td>
          <td>${esc(formatPaidAt(getSalaryPaidAt(row)))}</td>
        </tr>
      `;
    })
    .join("");
}

function fillYearOptions() {
  const el = $("salaryFilterYear");
  if (!el) return;

  const currentYear = new Date().getFullYear();
  let html = `<option value="">All Years</option>`;

  for (let year = currentYear + 1; year >= currentYear - 10; year--) {
    html += `<option value="${year}">${year}</option>`;
  }

  el.innerHTML = html;
}

function buildSalaryQuery() {
  const params = new URLSearchParams();

  const month = $("salaryFilterMonth")?.value || "";
  const year = $("salaryFilterYear")?.value || "";
  const status = $("salaryFilterStatus")?.value || "";

  if (month) params.append("month", month);
  if (year) params.append("year", year);
  if (status) params.append("status", status);

  return params.toString();
}

async function loadProfile() {
  try {
    const res = await apiGet("/api/profile/me");

    if (!res.ok) {
      toast(getErrorMessage(res, "Failed to load profile"), false);
      return null;
    }

    const p = res.data || {};

    setVal("profileName", p.full_name || p.name || "");
    setVal("profileEmail", p.email || "");
    setVal("profileRole", p.role || "");
    setVal("profileArea", p.area || "");

    applyRoleVisibility(p.role || "");
    return p;
  } catch (err) {
    console.error("loadProfile error:", err);
    toast("Failed to load profile", false);
    return null;
  }
}

async function loadSalaryHistory(showToastOnError = false) {
  try {
    const query = buildSalaryQuery();
    const url = query
      ? `/api/salary/my-history?${query}`
      : "/api/salary/my-history";

    const res = await apiGet(url);

    if (!res.ok) {
      setSalaryTableEmpty(getErrorMessage(res, "No salary records found"));
      if (showToastOnError) {
        toast(getErrorMessage(res, "Failed to load salary history"), false);
      }
      return;
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    renderSalaryTable(rows);
  } catch (err) {
    console.error("loadSalaryHistory error:", err);
    setSalaryTableEmpty("No salary records found");
    if (showToastOnError) {
      toast("Failed to load salary history", false);
    }
  }
}

function resetSalaryFilters() {
  setVal("salaryFilterMonth", "");
  setVal("salaryFilterYear", "");
  setVal("salaryFilterStatus", "");
}

async function exportSalaryPdf() {
  const query = buildSalaryQuery();
  const baseUrl = getApiBaseUrl();
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token") || "";

  const url = query
    ? `${baseUrl}/api/salary/export-pdf?${query}`
    : `${baseUrl}/api/salary/export-pdf`;

  if (!token) {
    toast("Please login again", false);
    return;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      let msg = "Failed to export PDF";
      try {
        const data = await res.json();
        msg = getErrorMessage(data, msg);
      } catch {
        const text = await res.text();
        if (text) msg = text;
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const fileUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = "salary-history.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(fileUrl);
    toast("PDF downloaded ✅", true);
  } catch (err) {
    console.error("exportSalaryPdf error:", err);
    toast(err.message || "Failed to export PDF", false);
  }
}

async function changePassword() {
  const np = $("newPassword")?.value?.trim() || "";
  const cp = $("confirmNewPassword")?.value?.trim() || "";

  if (!np || np.length < 6) {
    setMsg("Password must be at least 6 characters");
    toast("Password must be at least 6 characters", false);
    return;
  }

  if (!cp) {
    setMsg("Please confirm the password");
    toast("Please confirm the password", false);
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
      const msg = getErrorMessage(res, "Failed to update password");
      setMsg(msg);
      toast(msg, false);
      return;
    }

    setVal("newPassword", "");
    setVal("confirmNewPassword", "");

    setMsg("Password updated successfully", true);
    toast("Password updated ✅", true);
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

  $("filterSalaryBtn")?.addEventListener("click", async () => {
    await loadSalaryHistory(true);
  });

  $("resetSalaryBtn")?.addEventListener("click", async () => {
    resetSalaryFilters();
    await loadSalaryHistory();
  });

  $("exportSalaryPdfBtn")?.addEventListener("click", exportSalaryPdf);

  fillYearOptions();
  await loadProfile();
  await loadSalaryHistory();
});