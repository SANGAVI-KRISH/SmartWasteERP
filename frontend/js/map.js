import { apiGet } from "./apiClient.js";

let map;
let markersLayer;
let refreshTimer = null;

const DEFAULT_CENTER = { lat: 11.0168, lng: 76.9558 }; // Coimbatore

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1700);
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getCurrentLocationFallback() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(DEFAULT_CENTER);

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        }),
      () => resolve(DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  });
}

function initMap(centerLat, centerLng, zoom = 7) {
  map = L.map("map", { zoomControl: true }).setView([centerLat, centerLng], zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function clearMarkers() {
  markersLayer?.clearLayers();
}

const redIcon = L.icon({
  iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28]
});

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeLatLng(lat, lng) {
  let a = toNum(lat);
  let b = toNum(lng);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }

  // Normal valid pair
  if (isValidLatLng(a, b)) {
    return { lat: a, lng: b };
  }

  // If swapped accidentally, try reversing once
  if (isValidLatLng(b, a)) {
    return { lat: b, lng: a, swapped: true };
  }

  return null;
}

function addBinMarker(bin) {
  const coords = normalizeLatLng(bin.latitude, bin.longitude);
  if (!coords) return false;

  const lat = coords.lat;
  const lng = coords.lng;

  const id = esc(bin.bin_id ?? bin.id ?? "-");
  const area = esc(bin.area ?? bin.location ?? bin.address ?? bin.zone ?? "Unknown");
  const status = esc(bin.status ?? "Unknown");
  const updated = bin.updated_at ? new Date(bin.updated_at).toLocaleString() : "";
  const updatedSafe = esc(updated);

  const popup = `
    <div style="min-width:220px">
      <div style="font-weight:800; margin-bottom:6px;">🗑 Bin Needs Collection</div>
      <div><b>Bin ID:</b> ${id}</div>
      <div><b>Area:</b> ${area}</div>
      <div><b>Status:</b> ${status}</div>
      ${updated ? `<div><b>Last Updated:</b> ${updatedSafe}</div>` : ""}
      <div style="margin-top:6px; font-size:12px; opacity:.75;">
        ${lat.toFixed(5)}, ${lng.toFixed(5)}
      </div>
      ${
        coords.swapped
          ? `<div style="margin-top:6px; font-size:12px; color:#b45309;">
               Coordinate order corrected automatically
             </div>`
          : ""
      }
    </div>
  `;

  L.marker([lat, lng], { icon: redIcon })
    .addTo(markersLayer)
    .bindPopup(popup);

  return true;
}

async function fetchBinsForMap() {
  const res = await apiGet("/api/map/full-bins");
  if (!res.ok) {
    toast(res.message || "Failed to load bins");
    return [];
  }
  return Array.isArray(res.data) ? res.data : [];
}

function getValidLatLngs(bins) {
  return bins
    .map((bin) => normalizeLatLng(bin.latitude, bin.longitude))
    .filter(Boolean)
    .map((c) => [c.lat, c.lng]);
}

async function renderLivePins({ keepView = false } = {}) {
  const bins = await fetchBinsForMap();

  clearMarkers();

  let shown = 0;
  let skipped = 0;

  for (const bin of bins) {
    const ok = addBinMarker(bin);
    if (ok) shown++;
    else skipped++;
  }

  const latlngs = getValidLatLngs(bins);

  if (!keepView) {
    if (latlngs.length >= 2) {
      map.fitBounds(latlngs, { padding: [30, 30] });
    } else if (latlngs.length === 1) {
      map.setView(latlngs[0], 13);
    } else {
      map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 7);
    }
  }

  if (bins.length > 0 && shown === 0) {
    toast("No valid bin coordinates found");
  } else if (skipped > 0) {
    toast(`${shown} pin(s) shown, ${skipped} skipped due to invalid coordinates`);
  }
}

function startPollingFallback() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    renderLivePins({ keepView: true }).catch(() => {
      toast("Auto refresh failed");
    });
  }, 15000);
}

function cleanup() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "index.html";
}

window.addEventListener("beforeunload", cleanup);

window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  document.getElementById("logoutBtnTop")?.addEventListener("click", safeLogout);

  const loc = await getCurrentLocationFallback();
  initMap(loc.lat, loc.lng, 7);

  await renderLivePins();
  startPollingFallback();
});