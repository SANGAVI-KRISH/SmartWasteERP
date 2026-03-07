import { apiGet } from "./apiClient.js";

let map;
let markersLayer;
let refreshTimer = null;

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

async function getCurrentLocationFallback() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: 11.0168, lng: 76.9558 });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: 11.0168, lng: 76.9558 }),
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

function addBinMarker(bin) {
  const lat = Number(bin.latitude);
  const lng = Number(bin.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const id = bin.bin_id ?? bin.id ?? "-";
  const area = bin.area ?? bin.location ?? bin.address ?? bin.zone ?? "Unknown";
  const status = bin.status ?? "Unknown";
  const updated = bin.updated_at ? new Date(bin.updated_at).toLocaleString() : "";

  const popup = `
    <div style="min-width:220px">
      <div style="font-weight:800; margin-bottom:6px;">🗑 Bin Needs Collection</div>
      <div><b>Bin ID:</b> ${id}</div>
      <div><b>Area:</b> ${area}</div>
      <div><b>Status:</b> ${status}</div>
      ${updated ? `<div><b>Last Updated:</b> ${updated}</div>` : ""}
      <div style="margin-top:6px; font-size:12px; opacity:.75;">
        ${lat.toFixed(5)}, ${lng.toFixed(5)}
      </div>
    </div>
  `;

  L.marker([lat, lng], { icon: redIcon })
    .addTo(markersLayer)
    .bindPopup(popup);
}

async function fetchBinsForMap() {
  const res = await apiGet("/api/map/full-bins");
  if (!res.ok) {
    toast(res.message || "Failed to load bins");
    return [];
  }
  return res.data || [];
}

async function renderLivePins({ keepView = false } = {}) {
  const bins = await fetchBinsForMap();

  clearMarkers();

  for (const bin of bins) {
    addBinMarker(bin);
  }

  if (keepView) return;

  const latlngs = bins
    .filter(bin => Number.isFinite(Number(bin.latitude)) && Number.isFinite(Number(bin.longitude)))
    .map(bin => [Number(bin.latitude), Number(bin.longitude)]);

  if (latlngs.length >= 2) {
    map.fitBounds(latlngs, { padding: [30, 30] });
  } else if (latlngs.length === 1) {
    map.setView(latlngs[0], 13);
  }
}

function startPollingFallback() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => renderLivePins({ keepView: true }), 15000);
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