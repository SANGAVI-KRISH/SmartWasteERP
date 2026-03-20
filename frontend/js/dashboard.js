import { apiGet } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  const t = $("toast");
  if (!t) {
    alert(msg);
    return;
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

let districtCollectionChart = null;
let wasteCategoryChart = null;
let complaintsChart = null;
let monthlyTrendChart = null;
let revenueTrendChart = null;

const TN_DISTRICTS = [
  "Ariyalur",
  "Chengalpattu",
  "Chennai",
  "Coimbatore",
  "Cuddalore",
  "Dharmapuri",
  "Dindigul",
  "Erode",
  "Kallakurichi",
  "Kancheepuram",
  "Karur",
  "Krishnagiri",
  "Madurai",
  "Mayiladuthurai",
  "Nagapattinam",
  "Namakkal",
  "Nilgiris",
  "Perambalur",
  "Pudukkottai",
  "Ramanathapuram",
  "Ranipet",
  "Salem",
  "Sivaganga",
  "Tenkasi",
  "Thanjavur",
  "Theni",
  "Thoothukudi",
  "Tiruchirappalli",
  "Tirunelveli",
  "Tirupathur",
  "Tiruppur",
  "Tiruvallur",
  "Tiruvannamalai",
  "Tiruvarur",
  "Vellore",
  "Viluppuram",
  "Virudhunagar",
  "Kanniyakumari",
];

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function toNum(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatKg(value) {
  return `${Math.round(toNum(value))} kg`;
}

function formatCurrency(value) {
  return `₹${Math.round(toNum(value))}`;
}

function formatPercent(value) {
  return `${Math.round(toNum(value))}%`;
}

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function generateColors(count) {
  const base = [
    "#4CAF50",
    "#2196F3",
    "#FF9800",
    "#9C27B0",
    "#E91E63",
    "#009688",
    "#3F51B5",
    "#795548",
    "#00ACC1",
    "#8BC34A",
    "#F44336",
    "#FFC107",
  ];

  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(base[i % base.length]);
  }
  return colors;
}

function normalizeLabel(item) {
  return (
    item?.label ??
    item?.name ??
    item?.district ??
    item?.zone ??
    item?.area ??
    "Unknown"
  );
}

function normalizeValue(item) {
  return (
    item?.value ??
    item?.kg ??
    item?.total ??
    item?.waste ??
    item?.collectionKg ??
    0
  );
}

function cleanDistrictText(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractValidTNDistrict(label) {
  const cleaned = cleanDistrictText(label);
  const lower = cleaned.toLowerCase();

  for (const district of TN_DISTRICTS) {
    const d = district.toLowerCase();

    if (
      lower === d ||
      lower.startsWith(d + " ") ||
      lower.endsWith(" " + d) ||
      lower.includes(" " + d + " ") ||
      lower.includes(d)
    ) {
      return district;
    }
  }

  return "";
}

function getFilteredDistrictStats(data) {
  const raw = Array.isArray(data.districtStats)
    ? data.districtStats
    : Array.isArray(data.zoneStats)
    ? data.zoneStats
    : [];

  const merged = new Map();

  for (const item of raw) {
    if (!item) continue;

    const validDistrict = extractValidTNDistrict(normalizeLabel(item));
    if (!validDistrict) continue;

    merged.set(
      validDistrict,
      (merged.get(validDistrict) || 0) + toNum(normalizeValue(item))
    );
  }

  return Array.from(merged.entries()).map(([label, value]) => ({
    label,
    value: Math.round(value),
  }));
}

function renderStatsList(
  containerId,
  items,
  formatter = (v) => String(v),
  emptyText = "No data available"
) {
  const container = $(containerId);
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `
      <div class="stats-row">
        <span>${emptyText}</span>
        <strong>0</strong>
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <div class="stats-row">
          <span>${normalizeLabel(item)}</span>
          <strong>${formatter(normalizeValue(item))}</strong>
        </div>
      `
    )
    .join("");
}

function renderMonthlyTrendTable(monthlyTrend) {
  const tbody = $("monthlyTrendTableBody");
  if (!tbody) return;

  if (!Array.isArray(monthlyTrend) || monthlyTrend.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">No monthly trend data available</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = monthlyTrend
    .map(
      (item) => `
        <tr>
          <td>${item.month ?? "-"}</td>
          <td>${Math.round(toNum(item.collectionKg))}</td>
          <td>${Math.round(toNum(item.recyclingKg))}</td>
          <td>${Math.round(toNum(item.complaints))}</td>
          <td>${Math.round(toNum(item.revenue))}</td>
        </tr>
      `
    )
    .join("");
}

function normalizeMonthlyTrend(data) {
  const monthlyTrend = Array.isArray(data?.monthlyTrend) ? data.monthlyTrend : [];

  return monthlyTrend
    .filter((item) => item && item.month)
    .map((item) => ({
      month: item.month ?? "-",
      collectionKg: toNum(item.collectionKg),
      recyclingKg: toNum(item.recyclingKg),
      complaints: toNum(item.complaints),
      revenue: toNum(item.revenue),
    }));
}

function renderCharts(data) {
  destroyChart(districtCollectionChart);
  destroyChart(wasteCategoryChart);
  destroyChart(complaintsChart);
  destroyChart(monthlyTrendChart);
  destroyChart(revenueTrendChart);

  const districtCtx = $("districtCollectionChart");
  const wasteCtx = $("wasteCategoryChart");
  const complaintsCtx = $("complaintsChart");
  const trendCtx = $("monthlyTrendChart");
  const revenueCtx = $("revenueTrendChart");

  const districtStats = getFilteredDistrictStats(data);

  const wasteTypeStats = Array.isArray(data.wasteTypeStats)
    ? data.wasteTypeStats.filter((x) => x)
    : [];

  const complaintStats = Array.isArray(data.complaintStats)
    ? data.complaintStats.filter((x) => x)
    : [];

  const monthlyTrend = normalizeMonthlyTrend(data);

  if (districtCtx) {
    districtCollectionChart = new Chart(districtCtx, {
      type: "bar",
      data: {
        labels: districtStats.length
          ? districtStats.map((item) => normalizeLabel(item))
          : ["No Data"],
        datasets: [
          {
            label: "Collected Waste (kg)",
            data: districtStats.length
              ? districtStats.map((item) => toNum(normalizeValue(item)))
              : [0],
            backgroundColor: generateColors(districtStats.length || 1),
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  if (wasteCtx) {
    wasteCategoryChart = new Chart(wasteCtx, {
      type: "pie",
      data: {
        labels: wasteTypeStats.length
          ? wasteTypeStats.map((item) => normalizeLabel(item))
          : ["No Data"],
        datasets: [
          {
            data: wasteTypeStats.length
              ? wasteTypeStats.map((item) => toNum(normalizeValue(item)))
              : [1],
            backgroundColor: generateColors(wasteTypeStats.length || 1),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  if (complaintsCtx) {
    complaintsChart = new Chart(complaintsCtx, {
      type: "doughnut",
      data: {
        labels: complaintStats.length
          ? complaintStats.map((item) => normalizeLabel(item))
          : ["No Data"],
        datasets: [
          {
            data: complaintStats.length
              ? complaintStats.map((item) => toNum(normalizeValue(item)))
              : [1],
            backgroundColor: generateColors(complaintStats.length || 1),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  if (trendCtx) {
    const labels = monthlyTrend.length
      ? monthlyTrend.map((item) => item.month)
      : ["No Data"];

    monthlyTrendChart = new Chart(trendCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Collection (kg)",
            data: monthlyTrend.length
              ? monthlyTrend.map((item) => item.collectionKg)
              : [0],
            borderColor: "#3F51B5",
            backgroundColor: "rgba(63,81,181,0.15)",
            fill: false,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
          },
          {
            label: "Recycling (kg)",
            data: monthlyTrend.length
              ? monthlyTrend.map((item) => item.recyclingKg)
              : [0],
            borderColor: "#4CAF50",
            backgroundColor: "rgba(76,175,80,0.15)",
            fill: false,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  if (revenueCtx) {
    const revenueLabels = monthlyTrend.length
      ? monthlyTrend.map((item) => item.month)
      : ["No Data"];

    revenueTrendChart = new Chart(revenueCtx, {
      type: "line",
      data: {
        labels: revenueLabels,
        datasets: [
          {
            label: "Revenue (₹)",
            data: monthlyTrend.length
              ? monthlyTrend.map((item) => item.revenue)
              : [0],
            borderColor: "#FF9800",
            backgroundColor: "rgba(255,152,0,0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `Revenue: ₹${Math.round(toNum(context.raw))}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return "₹" + value;
              },
            },
          },
        },
      },
    });
  }
}

function updateSummaryCards(data) {
  setText("kpiCollected", formatKg(data.totalCollectedKg || 0));
  setText("kpiFullBins", String(Math.round(toNum(data.fullBins || 0))));
  setText("kpiRecycled", formatKg(data.totalRecycledKg || 0));
  setText("kpiTripsCompleted", String(Math.round(toNum(data.tripsCompleted || 0))));
  setText(
    "kpiRevenueGenerated",
    formatCurrency(data.revenueGenerated || data.monthRevenue || 0)
  );

  setText(
    "kpiPendingComplaints",
    String(Math.round(toNum(data.pendingComplaints || 0)))
  );
  setText(
    "kpiResolvedComplaints",
    String(Math.round(toNum(data.resolvedComplaints || 0)))
  );
  setText(
    "kpiActiveWorkers",
    String(Math.round(toNum(data.workerCount ?? data.activeWorkers ?? 0)))
  );
  setText("kpiRecyclingRate", formatPercent(data.recyclingRate || 0));
  setText("kpiCollectionEfficiency", formatPercent(data.collectionEfficiency || 0));

  setText("monthCollection", formatKg(data.monthCollectionKg || 0));
  setText("monthRecycling", formatKg(data.monthRecyclingKg || 0));
  setText("monthComplaints", String(Math.round(toNum(data.monthComplaints || 0))));
  setText("monthRevenue", formatCurrency(data.monthRevenue || 0));
}

function updateDynamicLists(data) {
  renderStatsList(
    "wasteCategoryList",
    Array.isArray(data.wasteTypeStats) ? data.wasteTypeStats : [],
    (value) => formatKg(value),
    "No category data available"
  );

  renderStatsList(
    "districtPerformanceList",
    getFilteredDistrictStats(data),
    (value) => formatKg(value),
    "No district data available"
  );

  renderMonthlyTrendTable(normalizeMonthlyTrend(data));
}

async function loadDashboard() {
  const res = await apiGet("/api/dashboard/summary");

  if (!res.ok) {
    toast(res.message || "Failed to load dashboard");
    return;
  }

  const data = res.data || {};
  console.log("Dashboard summary:", data);

  updateSummaryCards(data);
  updateDynamicLists(data);
  renderCharts(data);
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("session");
    localStorage.removeItem("smartwaste_session");
    localStorage.removeItem("cloudcrafter_session");
  } catch (e) {}

  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", async () => {
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);

  try {
    await loadDashboard();
  } catch (e) {
    console.error(e);
    toast(e?.message || "Dashboard statistics update failed");
  }

  setInterval(async () => {
    try {
      await loadDashboard();
    } catch (e) {
      console.error("Auto-refresh failed:", e);
    }
  }, 20000);
});