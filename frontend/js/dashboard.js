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

let __lastGoodRecycledKg = null;

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

async function loadDashboard() {
  const res = await apiGet("/api/dashboard/summary");

  if (!res.ok) {
    toast(res.message || "Failed to load dashboard");
    return;
  }

  const data = res.data || {};

  const collectedKg = Math.round(Number(data.totalCollectedKg || 0));
  const fullBins = Number(data.fullBins || 0);
  const recycledKg = Math.round(Number(data.totalRecycledKg || 0));
  const tripsCompleted = Number(data.tripsCompleted || 0);

  setText("kpiCollected", `${collectedKg} kg`);
  setText("kpiFullBins", String(fullBins));
  setText("kpiRecycled", `${recycledKg} kg`);
  setText("kpiTripsCompleted", String(tripsCompleted));

  __lastGoodRecycledKg = recycledKg;
}

function startRecycledOverwriteGuard() {
  const el = $("kpiRecycled");
  if (!el) return;

  const obs = new MutationObserver(() => {
    const txt = (el.textContent || "").trim();
    if (__lastGoodRecycledKg !== null && (txt === "0 kg" || txt === "0kg")) {
      el.textContent = `${__lastGoodRecycledKg} kg`;
    }
  });

  obs.observe(el, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("session");
    localStorage.removeItem("smartwaste_session");
    localStorage.removeItem("cloudcrafter_session");
  } catch {}
  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", async () => {
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);

  try {
    await loadDashboard();
    startRecycledOverwriteGuard();
  } catch (e) {
    console.error(e);
    toast(e?.message || "Dashboard KPI update failed");
  }

  setInterval(async () => {
    try {
      await loadDashboard();
    } catch {}
  }, 20000);
});