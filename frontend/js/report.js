import { apiGet } from "./apiClient.js";

const fmtKg = (n) => `${Math.round(Number(n) || 0)} kg`;

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  const t = $("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => (t.style.display = "none"), 1800);
}

function renderBars(typeTotals) {
  const barChart = $("barChart");
  barChart.innerHTML = "";

  const entries = Object.entries(typeTotals || {});
  const maxVal = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));

  entries.forEach(([type, val]) => {
    const pct = Math.round(((Number(val) || 0) / maxVal) * 100);

    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "120px 1fr 80px";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const label = document.createElement("div");
    label.textContent = String(type).toUpperCase();

    const barWrap = document.createElement("div");
    barWrap.style.height = "12px";
    barWrap.style.borderRadius = "999px";
    barWrap.style.background = "rgba(255,255,255,0.08)";
    barWrap.style.overflow = "hidden";

    const bar = document.createElement("div");
    bar.style.height = "100%";
    bar.style.width = pct + "%";
    bar.style.borderRadius = "999px";
    bar.style.background = "rgba(90, 152, 255, 0.9)";

    barWrap.appendChild(bar);

    const value = document.createElement("div");
    value.style.textAlign = "right";
    value.textContent = fmtKg(val);

    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(value);

    barChart.appendChild(row);
  });
}

function renderTypeTable(typeTotals) {
  const body = $("typeBreakdownBody");
  body.innerHTML = "";

  const entries = Object.entries(typeTotals || {}).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>(no data)</td><td></td>`;
    body.appendChild(tr);
    return;
  }

  entries.forEach(([type, val]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${String(type).toUpperCase()}</td><td>${fmtKg(val)}</td>`;
    body.appendChild(tr);
  });
}

async function generateReport() {
  const res = await apiGet("/api/report/summary");
  if (!res.ok) {
    throw new Error(res.message || "Failed to load report");
  }

  const data = res.data || {};

  $("kpiTotalCollected").textContent = fmtKg(data.totalCollected || 0);
  $("kpiTotalRecycled").textContent = fmtKg(data.totalRecycled || 0);
  $("kpiTotalLandfill").textContent = fmtKg(data.totalLandfill || 0);

  $("kpiFullBins").textContent = String(data.fullBins || 0);
  $("kpiCollectionCount").textContent = String(data.collectionCount || 0);
  $("kpiRecyclingCount").textContent = String(data.recyclingCount || 0);

  renderBars(data.typeTotals || {});
  renderTypeTable(data.typeTotals || {});
  $("insightText").textContent = data.insight || "No insight available.";
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
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
  document.querySelectorAll("#typeBreakdownBody tr").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    if (tds.length >= 2) rows.push([tds[0].textContent, tds[1].textContent]);
  });
  return rows;
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
  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);

  $("refreshBtn")?.addEventListener("click", async () => {
    try {
      await generateReport();
      toast("Report updated");
    } catch (e) {
      console.error(e);
      toast(e?.message || "Failed to load report");
    }
  });

  $("exportBtn")?.addEventListener("click", () => {
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
    if (typeRows.length) rows.push(...typeRows);
    else rows.push(["(no data)", ""]);

    rows.push([]);
    rows.push(["Insight", $("insightText")?.textContent || ""]);

    downloadCSV(filename, rows);
  });

  try {
    await generateReport();
  } catch (e) {
    console.error(e);
    toast(e?.message || "Failed to load report");
  }

  setInterval(async () => {
    try {
      await generateReport();
    } catch {}
  }, 20000);
});