const supabase = require("../config/supabase");

function normalizeStatus(bin) {
  return String(bin.status ?? bin.bin_status ?? "").trim().toLowerCase();
}

function isNeedCollection(bin) {
  return normalizeStatus(bin) === "full";
}

function getAreaText(bin) {
  return String(
    bin.area ??
    bin.location ??
    bin.address ??
    bin.zone ??
    ""
  ).trim();
}

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
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

async function geocodePlace(place) {
  if (!place) return null;

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(place);

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SmartWasteERP/1.0"
    }
  });

  const data = await res.json().catch(() => []);
  if (!Array.isArray(data) || !data.length) return null;

  const lat = toNum(data[0].lat);
  const lng = toNum(data[0].lon);

  if (!isValidLatLng(lat, lng)) return null;

  return { lat, lng };
}

exports.getFullBinsForMap = async () => {
  const { data, error } = await supabase
    .from("bins")
    .select("*")
    .limit(500);

  if (error) throw new Error(error.message);

  const bins = (data || []).filter(isNeedCollection);
  const result = [];

  for (const bin of bins) {
    const area = getAreaText(bin);
    if (!area) continue;

    const query = area.toLowerCase().includes("india")
      ? area
      : `${area}, Tamil Nadu, India`;

    const coords = await geocodePlace(query);
    if (!coords) continue;

    result.push({
      ...bin,
      latitude: coords.lat,
      longitude: coords.lng
    });
  }

  return result;
};