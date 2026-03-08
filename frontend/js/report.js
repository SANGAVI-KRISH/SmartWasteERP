import { apiGet } from "./apiClient.js";

const AUTO_REFRESH_MS = 10000;
let __reportTimer = null;
let __loadingReport = false;

function $(id) {
  return document.getElementById(id);
}

function fmtKg(n) {
  return `${Math.round(Number(n) || 0)} kg`;
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

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function clearNode(el) {
  if (el) el.innerHTML = "";
}

function normalizeTypeTotals(typeTotals) {
  if (!typeTotals || typeof typeTotals !== "object") return {};

  const out = {};
  for (const [key, value] of Object.entries(typeTotals)) {
    const safeKey = String(key || "").trim() || "Unknown";
    out[safeKey] = Number(value) || 0;
  }
  return out;
}

function renderBars(typeTotals) {
  const barChart = $("barChart");
  if (!barChart) return;

  clearNode(barChart);

  const safeTotals = normalizeTypeTotals(typeTotals);
  const entries = Object.entries(safeTotals).sort(
    (a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0)
  );

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.style.opacity = "0.7";
    empty.textContent = "No data available";
    barChart.appendChild(empty);
    return;
  }

  const maxVal = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));

  entries.forEach(([type, val]) => {
    const safeVal = Number(val) || 0;
    const pct = Math.max(0, Math.min(100, Math.round((safeVal / maxVal) * 100)));

    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "120px 1fr 80px";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.marginBottom = "10px";

    const label = document.createElement("div");
    label.textContent = String(type).toUpperCase();

    const barWrap = document.createElement("div");
    barWrap.style.height = "12px";
    barWrap.style.borderRadius = "999px";
    barWrap.style.background = "rgba(255,255,255,0.08)";
    barWrap.style.overflow = "hidden";

    const bar = document.createElement("div");
    bar.style.height = "100%";
    bar.style.width = `${pct}%`;
    bar.style.borderRadius = "999px";
    bar.style.background = "rgba(90, 152, 255, 0.9)";
    bar.style.transition = "width 0.35s ease";

    const value = document.createElement("div");
    value.style.textAlign = "right";
    value.textContent = fmtKg(safeVal);

    barWrap.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(value);

    barChart.appendChild(row);
  });
}

function renderTypeTable(typeTotals) {
  const body = $("typeBreakdownBody");
  if (!body) return;

  clearNode(body);

  const safeTotals = normalizeTypeTotals(typeTotals);
  const entries = Object.entries(safeTotals).sort(
    (a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0)
  );

  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>(no data)</td><td></td>`;
    body.appendChild(tr);
    return;
  }

  entries.forEach(([type, val]) => {
    const tr = document.createElement("tr");

    const tdType = document.createElement("td");
    tdType.textContent = String(type).toUpperCase();

    const tdVal = document.createElement("td");
    tdVal.textContent = fmtKg(val);

    tr.appendChild(tdType);
    tr.appendChild(tdVal);
    body.appendChild(tr);
  });
}

function buildInsight(data) {
  if (data?.insight && String(data.insight).trim()) {
    return String(data.insight).trim();
  }

  const totalCollected = Number(data?.totalCollected) || 0;
  const totalRecycled = Number(data?.totalRecycled) || 0;
  const totalLandfill = Number(data?.totalLandfill) || 0;
  const fullBins = Number(data?.fullBins) || 0;
  const collectionCount = Number(data?.collectionCount) || 0;
  const recyclingCount = Number(data?.recyclingCount) || 0;

  if (
    totalCollected === 0 &&
    totalRecycled === 0 &&
    totalLandfill === 0 &&
    fullBins === 0 &&
    collectionCount === 0 &&
    recyclingCount === 0
  ) {
    return "No report data available yet.";
  }

  const parts = [];

  if (fullBins > 0) {
    parts.push(`${fullBins} full bins need priority collection`);
  } else {
    parts.push("No full bins need urgent pickup");
  }

  if (collectionCount > 0 && totalCollected > 0) {
    const avgCollection = (totalCollected / collectionCount).toFixed(1);
    parts.push(`average collection is ${avgCollection} kg per record`);
  }

  if (totalCollected > 0) {
    const recycleRate = ((totalRecycled / Math.max(totalCollected, 1)) * 100).toFixed(1);
    parts.push(`recycling efficiency is ${recycleRate}%`);
  }

  if (totalLandfill > 0) {
    parts.push(`${Math.round(totalLandfill)} kg sent to landfill`);
  }

  return parts.join(" • ");
}

async function generateReport(showToastOnSuccess = false) {
  if (__loadingReport) return;
  __loadingReport = true;

  try {
    const res = await apiGet("/api/report/summary");

    if (!res?.ok) {
      throw new Error(res?.message || "Failed to load report");
    }

    const data = res.data || {};

    setText("kpiTotalCollected", fmtKg(data.totalCollected || 0));
    setText("kpiTotalRecycled", fmtKg(data.totalRecycled || 0));
    setText("kpiTotalLandfill", fmtKg(data.totalLandfill || 0));
    setText("kpiFullBins", String(data.fullBins || 0));
    setText("kpiCollectionCount", String(data.collectionCount || 0));
    setText("kpiRecyclingCount", String(data.recyclingCount || 0));

    renderBars(data.typeTotals || {});
    renderTypeTable(data.typeTotals || {});
    setText("insightText", buildInsight(data));

    if (showToastOnSuccess) {
      toast("Report updated", true);
    }
  } catch (e) {
    console.error("generateReport error:", e);
    setText("insightText", e?.message || "Failed to load report");
    if (showToastOnSuccess) {
      toast(e?.message || "Failed to load report", false);
    }
  } finally {
    __loadingReport = false;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function collectTypeTableRows() {
  const rows = [];

  document.querySelectorAll("#typeBreakdownBody tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length >= 2) {
      rows.push([
        tds[0].textContent || "",
        tds[1].textContent || ""
      ]);
    }
  });

  return rows;
}

function exportCurrentReport() {
  const now = new Date();
  const filename = `smart_waste_report_${now.toISOString().slice(0, 10)}.csv`;

  const rows = [];
  rows.push(["KPI", "Value"]);
  rows.push(["Total Collected", $("kpiTotalCollected")?.textContent || ""]);
  rows.push(["Total Recycled", $("kpiTotalRecycled")?.textContent || ""]);
  rows.push(["Sent to Landfill", $("kpiTotalLandfill")?.textContent || ""]);
  rows.push(["Full Bins", $("kpiFullBins")?.textContent || ""]);
  rows.push(["Collection Records", $("kpiCollectionCount")?.textContent || ""]);
  rows.push(["Recycling Records", $("kpiRecyclingCount")?.textContent || ""]);
  rows.push([]);

  rows.push(["Waste Type", "Total Collected (kg)"]);
  const typeRows = collectTypeTableRows();
  if (typeRows.length) {
    rows.push(...typeRows);
  } else {
    rows.push(["(no data)", ""]);
  }

  rows.push([]);
  rows.push(["Insight", $("insightText")?.textContent || ""]);

  downloadCSV(filename, rows);
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}

  window.location.href = "index.html";
}

function startAutoRefresh() {
  stopAutoRefresh();

  __reportTimer = setInterval(() => {
    generateReport(false);
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (__reportTimer) {
    clearInterval(__reportTimer);
    __reportTimer = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    generateReport(false);
    startAutoRefresh();
  }
});

window.addEventListener("beforeunload", stopAutoRefresh);

window.addEventListener("DOMContentLoaded", async () => {
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  $("refreshBtn")?.addEventListener("click", async () => {
    await generateReport(true);
  });

  $("exportBtn")?.addEventListener("click", exportCurrentReport);

  await generateReport(false);
  startAutoRefresh();
});