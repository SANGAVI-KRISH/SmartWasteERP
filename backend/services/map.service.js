const supabase = require("../config/supabase");

function normalizeStatus(bin) {
  return String(bin.status ?? bin.bin_status ?? "").trim().toLowerCase();
}

function isNeedCollection(bin) {
  return normalizeStatus(bin) === "full";
}

function getAreaText(bin) {
  return (
    bin.area ??
    bin.location ??
    bin.address ??
    bin.zone ??
    ""
  );
}

function getLatLngStrict(bin) {
  const lat = Number(bin.latitude ?? bin.lat);
  const lng = Number(bin.longitude ?? bin.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

async function geocodePlace(place) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(place);

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "SmartWasteERP/1.0"
    }
  });

  const data = await res.json().catch(() => []);
  if (!Array.isArray(data) || !data.length) return null;

  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function ensureBinHasCoordinates(bin) {
  const existing = getLatLngStrict(bin);
  if (existing) {
    return {
      ...bin,
      latitude: existing.lat,
      longitude: existing.lng
    };
  }

  const area = getAreaText(bin);
  if (!area) return null;

  const query = area.toLowerCase().includes("india")
    ? area
    : `${area}, Tamil Nadu, India`;

  const coords = await geocodePlace(query);
  if (!coords) return null;

  const idCol = bin.bin_id != null ? "bin_id" : "id";
  const idVal = bin.bin_id != null ? bin.bin_id : bin.id;

  if (idVal != null) {
    const { error } = await supabase
      .from("bins")
      .update({ latitude: coords.lat, longitude: coords.lng })
      .eq(idCol, idVal);

    if (error) {
      console.warn("Could not update coords:", error.message || error);
    }
  }

  return {
    ...bin,
    latitude: coords.lat,
    longitude: coords.lng
  };
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
    const updated = await ensureBinHasCoordinates(bin);
    if (updated) result.push(updated);
  }

  return result;
};