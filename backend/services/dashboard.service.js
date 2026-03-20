const supabase = require("../config/supabase");
const axios = require("axios");

const DISTRICT_CACHE = new Map();

console.log("OPENCAGE_API_KEY loaded:", !!process.env.OPENCAGE_API_KEY);

function toNum(x) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;

  const s = String(x).trim();
  if (!s) return 0;

  const cleaned = s.replace(/,/g, "");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) || 0 : 0;
}

function readCol(row, names) {
  for (const n of names) {
    const v = row?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function displayText(value) {
  return String(value || "").trim();
}

function cleanLocationText(value) {
  return displayText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameMonth(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function calcPercentage(part, total) {
  part = Number(part || 0);
  total = Number(total || 0);
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function monthKey(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabelFromKey(key) {
  const [year, month] = String(key).split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;

  return d.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function sortByLabelAsc(items) {
  return [...items].sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""))
  );
}

function filterPositiveStats(items) {
  return (items || []).filter(
    (item) => item && displayText(item.label) && Number(item.value || 0) > 0
  );
}

function getRecyclingKgCols() {
  return [
    "recycled_kg",
    "recycled",
    "total_recycled",
    "input_kg",
    "weight_kg",
    "input",
    "weight",
    "quantity_kg",
    "collected_kg",
    "collection_kg",
    "kg",
    "waste_kg",
    "total_weight",
    "total_kg",
    "total",
    "recycledKg",
    "qty_kg",
    "qty",
  ];
}

function getDateCols() {
  return [
    "date",
    "txn_date",
    "rdate",
    "created_at",
    "updated_at",
  ];
}

function financeNormalizeText(v) {
  return String(v || "").trim();
}

function resolveDate(row) {
  return readCol(row, getDateCols());
}

function resolveRecyclingKg(row) {
  return toNum(readCol(row, getRecyclingKgCols()));
}

function isInvalidDistrictName(value) {
  const text = cleanLocationText(value).toLowerCase();
  return !text || text === "tamil nadu" || text === "india";
}

function extractDistrictFromComponents(components = {}) {
  const candidates = [
    components.state_district,
    components.county,
    components.region,
  ];

  for (const value of candidates) {
    const text = cleanLocationText(value);
    if (!text) continue;
    if (isInvalidDistrictName(text)) continue;
    return text;
  }

  return "";
}

async function getDistrictFromGeocoding(placeText) {
  const apiKey = String(process.env.OPENCAGE_API_KEY || "").trim();
  const place = cleanLocationText(placeText);

  if (!place || !apiKey) {
    console.error("district geocoding skipped:", {
      hasPlace: !!place,
      hasApiKey: !!apiKey,
    });
    return "";
  }

  const cacheKey = place.toLowerCase();
  if (DISTRICT_CACHE.has(cacheKey)) {
    return DISTRICT_CACHE.get(cacheKey);
  }

  try {
    const response = await axios.get("https://api.opencagedata.com/geocode/v1/json", {
      params: {
        q: `${place}, Tamil Nadu, India`,
        key: apiKey,
        countrycode: "in",
        limit: 1,
        no_annotations: 1,
        language: "en",
      },
      timeout: 8000,
    });

    const result = response?.data?.results?.[0];
    const district = extractDistrictFromComponents(result?.components || {});

    if (district) {
      DISTRICT_CACHE.set(cacheKey, district);
      return district;
    }

    DISTRICT_CACHE.set(cacheKey, "");
    return "";
  } catch (err) {
    console.error("district geocoding failed:", {
      place,
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });
    return "";
  }
}

async function resolveDistrict(row) {
  const directDistrict = cleanLocationText(
    readCol(row, ["district", "District", "district_name", "districtName"])
  );

  if (directDistrict && !isInvalidDistrictName(directDistrict)) {
    return directDistrict;
  }

  const place = cleanLocationText(
    readCol(row, [
      "area",
      "zone",
      "location",
      "address",
      "place",
      "bin_location",
      "landmark",
    ])
  );

  if (!place) return "Unknown District";

  const apiDistrict = await getDistrictFromGeocoding(place);

  if (apiDistrict && !isInvalidDistrictName(apiDistrict)) {
    return apiDistrict;
  }

  return place;
}

async function getLatestRatesMap() {
  const { data, error } = await supabase
    .from("finance_rates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("finance_rates load failed:", error.message);
    return {};
  }

  const map = {};
  for (const row of data || []) {
    const waste = financeNormalizeText(row.waste_type);
    const type = financeNormalizeText(row.rate_type).toLowerCase();
    const key = `${waste}__${type}`;

    if (!map[key]) {
      map[key] = toNum(row.rate_per_kg);
    }
  }

  return map;
}

async function getCollectionRows() {
  const selectCandidates = [
    "id, quantity_kg, waste_type, date, district, area, zone, location, created_at",
    "id, quantity_kg, waste_type, district, area, zone, location, created_at",
    "id, quantity_kg, waste_type, date, area, location, created_at",
    "id, quantity_kg, waste_type, area, location, created_at",
    "id, quantity_kg, waste_type, date, area, created_at",
    "id, quantity_kg, waste_type, date, location, created_at",
    "id, quantity_kg, waste_type, area, created_at",
    "id, quantity_kg, waste_type, location, created_at",
    "id, quantity_kg, waste_type, created_at",
    "*",
  ];

  let lastErr = null;

  for (const sel of selectCandidates) {
    const res = await supabase.from("collection_records").select(sel);

    if (!res.error) {
      return res.data || [];
    }

    lastErr = res.error;
  }

  throw new Error(lastErr?.message || "Cannot load collection records.");
}

async function getTotalCollectedKg() {
  const rows = await getCollectionRows();
  return rows.reduce((sum, row) => sum + toNum(row.quantity_kg), 0);
}

async function getFullBins() {
  const { data, error } = await supabase.from("bins").select("status");

  if (error) throw new Error(error.message);

  return (data || []).filter((row) => normalizeText(row.status) === "full").length;
}

async function loadRecyclingAuto() {
  const tableCandidates = [
    "recycling_records",
    "recycling",
    "recycle_records",
    "recycle",
  ];

  const selectCandidates = [
    "id, rdate, date, created_at, waste_type, type, category, input, input_kg, weight_kg, quantity_kg, collected_kg, recycled, recycled_kg, total_recycled, total_weight, total_kg, kg",
    "*",
  ];

  let lastErr = null;

  for (const table of tableCandidates) {
    for (const sel of selectCandidates) {
      const res = await supabase
        .from(table)
        .select(sel)
        .order("created_at", { ascending: true });

      if (!res.error) {
        return res.data || [];
      }

      lastErr = res.error;
    }
  }

  throw new Error(lastErr?.message || "Cannot load recycling data.");
}

async function getTotalRecycledKg() {
  const rows = await loadRecyclingAuto();
  return rows.reduce((acc, row) => acc + resolveRecyclingKg(row), 0);
}

async function getTripsCompleted() {
  const candidates = [
    { table: "staff_tasks", cols: ["status"], doneAny: ["COMPLETED"] },
    { table: "trips", cols: ["status", "trip_status"], doneAny: ["COMPLETED", "DONE"] },
    {
      table: "trip_logs",
      cols: ["status", "trip_status", "action"],
      doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"],
    },
    {
      table: "staff_vehicle_logs",
      cols: ["status", "trip_status", "action"],
      doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"],
    },
    {
      table: "vehicle_logs",
      cols: ["status", "trip_status", "action"],
      doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"],
    },
  ];

  for (const t of candidates) {
    const sel = ["id", ...t.cols].join(",");
    const res = await supabase.from(t.table).select(sel);
    if (res.error) continue;

    const rows = res.data || [];
    const doneSet = new Set(t.doneAny.map((x) => String(x).toUpperCase()));

    let count = 0;

    for (const row of rows) {
      let val = "";
      for (const c of t.cols) {
        const v = row?.[c];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          val = String(v).toUpperCase().trim();
          break;
        }
      }
      if (doneSet.has(val)) count++;
    }

    return count;
  }

  return 0;
}

async function getComplaintRows() {
  const tableCandidates = ["complaints", "complaint_records"];

  for (const table of tableCandidates) {
    const res = await supabase.from(table).select("id,status,created_at");
    if (!res.error) {
      return res.data || [];
    }
  }

  return [];
}

async function getComplaintStats() {
  const rows = await getComplaintRows();

  let pendingComplaints = 0;
  let resolvedComplaints = 0;
  let monthComplaints = 0;

  for (const row of rows) {
    const status = normalizeText(row.status);

    if (["pending", "open", "in_progress", "in progress"].includes(status)) {
      pendingComplaints++;
    }

    if (["resolved", "closed", "completed"].includes(status)) {
      resolvedComplaints++;
    }

    if (isSameMonth(row.created_at)) {
      monthComplaints++;
    }
  }

  return {
    pendingComplaints,
    resolvedComplaints,
    monthComplaints,
    complaintStats: [
      { label: "Pending", value: pendingComplaints },
      { label: "Resolved", value: resolvedComplaints },
    ],
  };
}

async function getWorkerCount() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role");

  if (error) {
    console.error("profiles worker load failed:", error.message);
    return 0;
  }

  return (data || []).filter((row) => {
    const role = String(row?.role || "").trim().toLowerCase();
    return role === "worker";
  }).length;
}

async function getWasteCategoryStats() {
  const rows = await loadRecyclingAuto();
  const map = new Map();

  for (const row of rows) {
    let type = displayText(readCol(row, ["waste_type", "type", "category"]));
    const typeNorm = normalizeText(type);
    const kg = resolveRecyclingKg(row);

    if (kg <= 0) continue;

    if (!type) type = "Other";
    else if (
      typeNorm.includes("organic") ||
      typeNorm.includes("food") ||
      typeNorm.includes("wet")
    ) {
      type = "Organic";
    } else if (typeNorm.includes("plastic")) {
      type = "Plastic";
    } else if (typeNorm.includes("metal")) {
      type = "Metal";
    } else if (typeNorm.includes("paper")) {
      type = "Paper";
    }

    map.set(type, (map.get(type) || 0) + kg);
  }

  const wasteTypeStats = filterPositiveStats(
    sortByLabelAsc(
      Array.from(map.entries()).map(([label, value]) => ({
        label,
        value: Math.round(value),
      }))
    )
  );

  const plasticKg =
    wasteTypeStats.find((x) => normalizeText(x.label) === "plastic")?.value || 0;
  const organicKg =
    wasteTypeStats.find((x) => normalizeText(x.label) === "organic")?.value || 0;
  const metalKg =
    wasteTypeStats.find((x) => normalizeText(x.label) === "metal")?.value || 0;
  const paperKg =
    wasteTypeStats.find((x) => normalizeText(x.label) === "paper")?.value || 0;

  return {
    plasticKg,
    organicKg,
    metalKg,
    paperKg,
    wasteTypeStats,
  };
}

async function getDistrictPerformanceStats() {
  const rows = await getCollectionRows();

  const districtMap = new Map();
  let monthCollectionKg = 0;

  for (const row of rows) {
    const kg = toNum(row.quantity_kg);
    if (kg <= 0) continue;

    const districtLabel = await resolveDistrict(row);

    districtMap.set(districtLabel, (districtMap.get(districtLabel) || 0) + kg);

    const dateValue = resolveDate(row);
    if (isSameMonth(dateValue)) {
      monthCollectionKg += kg;
    }
  }

  const districtStats = filterPositiveStats(
    sortByLabelAsc(
      Array.from(districtMap.entries()).map(([label, value]) => ({
        label,
        value: Math.round(value),
      }))
    )
  );

  return {
    districtStats,
    monthCollectionKg,
  };
}

async function getMonthlyRecyclingKg() {
  const rows = await loadRecyclingAuto();

  let monthRecyclingKg = 0;

  for (const row of rows) {
    const dateValue = resolveDate(row);
    if (isSameMonth(dateValue)) {
      monthRecyclingKg += resolveRecyclingKg(row);
    }
  }

  return monthRecyclingKg;
}

async function getComputedCollectionIncomeRows() {
  const rates = await getLatestRatesMap();
  const rows = await getCollectionRows();

  return Promise.all(
    (rows || []).map(async (r) => {
      const wasteType = displayText(r.waste_type);
      const quantityKg = toNum(r.quantity_kg);
      const ratePerKg = toNum(rates[`${wasteType}__collection`]);
      const amount = quantityKg * ratePerKg;
      const district = await resolveDistrict(r);

      return {
        id: `collection-${r.id}`,
        txn_date: resolveDate(r),
        type: "income",
        category: "collection",
        source_table: "collection_records",
        source_id: r.id,
        waste_type: wasteType || null,
        quantity_kg: quantityKg,
        rate_per_kg: ratePerKg,
        amount,
        description: `Collection income${district ? ` - ${district}` : ""}`,
        created_at: r.created_at || null,
        is_auto: true,
      };
    })
  );
}

async function getComputedRecyclingIncomeRows() {
  const rates = await getLatestRatesMap();
  const rows = await loadRecyclingAuto();

  return (rows || []).map((r) => {
    const wasteType = displayText(readCol(r, ["waste_type", "type", "category"]));
    const recycledKg = resolveRecyclingKg(r);
    const ratePerKg = toNum(rates[`${wasteType}__recycling`]);
    const amount = recycledKg * ratePerKg;

    return {
      id: `recycling-${r.id}`,
      txn_date: resolveDate(r),
      type: "income",
      category: "recycling",
      source_table: "recycling_records",
      source_id: r.id,
      waste_type: wasteType || null,
      quantity_kg: recycledKg,
      rate_per_kg: ratePerKg,
      amount,
      description: "Recycling income",
      created_at: r.created_at || null,
      is_auto: true,
    };
  });
}

async function getRevenueStats() {
  const [collectionIncomeRows, recyclingIncomeRows] = await Promise.all([
    getComputedCollectionIncomeRows(),
    getComputedRecyclingIncomeRows(),
  ]);

  const incomeRows = [...collectionIncomeRows, ...recyclingIncomeRows];

  let revenueGenerated = 0;
  let monthRevenue = 0;

  for (const row of incomeRows) {
    const amount = toNum(row.amount);
    revenueGenerated += amount;

    const dateValue = row.txn_date || row.created_at;
    if (isSameMonth(dateValue)) {
      monthRevenue += amount;
    }
  }

  return {
    revenueGenerated,
    monthRevenue,
  };
}

async function getMonthlyTrend() {
  const [
    collectionRows,
    recyclingRows,
    complaintRows,
    collectionIncomeRows,
    recyclingIncomeRows,
  ] = await Promise.all([
    getCollectionRows(),
    loadRecyclingAuto(),
    getComplaintRows(),
    getComputedCollectionIncomeRows(),
    getComputedRecyclingIncomeRows(),
  ]);

  const monthMap = new Map();

  function ensureMonth(key) {
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        key,
        month: monthLabelFromKey(key),
        collectionKg: 0,
        recyclingKg: 0,
        complaints: 0,
        revenue: 0,
      });
    }
    return monthMap.get(key);
  }

  for (const row of collectionRows) {
    const key = monthKey(resolveDate(row));
    if (!key) continue;

    const item = ensureMonth(key);
    item.collectionKg += toNum(row.quantity_kg);
  }

  for (const row of recyclingRows) {
    const key = monthKey(resolveDate(row));
    if (!key) continue;

    const item = ensureMonth(key);
    item.recyclingKg += resolveRecyclingKg(row);
  }

  for (const row of complaintRows) {
    const key = monthKey(row.created_at);
    if (!key) continue;

    const item = ensureMonth(key);
    item.complaints += 1;
  }

  for (const row of collectionIncomeRows) {
    const key = monthKey(row.txn_date || row.created_at);
    if (!key) continue;

    const item = ensureMonth(key);
    item.revenue += toNum(row.amount);
  }

  for (const row of recyclingIncomeRows) {
    const key = monthKey(row.txn_date || row.created_at);
    if (!key) continue;

    const item = ensureMonth(key);
    item.revenue += toNum(row.amount);
  }

  return Array.from(monthMap.values())
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .map((value) => ({
      month: value.month,
      collectionKg: Math.round(value.collectionKg),
      recyclingKg: Math.round(value.recyclingKg),
      complaints: Math.round(value.complaints),
      revenue: Math.round(value.revenue),
    }))
    .filter(
      (item) =>
        item.collectionKg > 0 ||
        item.recyclingKg > 0 ||
        item.complaints > 0 ||
        item.revenue > 0
    );
}

exports.getDashboardSummary = async () => {
  const [
    totalCollectedKg,
    fullBins,
    totalRecycledKg,
    tripsCompleted,
    complaintStatsData,
    workerCount,
    wasteCategoryStatsData,
    districtStatsData,
    monthRecyclingKg,
    revenueStats,
    monthlyTrend,
  ] = await Promise.all([
    getTotalCollectedKg(),
    getFullBins(),
    getTotalRecycledKg(),
    getTripsCompleted(),
    getComplaintStats(),
    getWorkerCount(),
    getWasteCategoryStats(),
    getDistrictPerformanceStats(),
    getMonthlyRecyclingKg(),
    getRevenueStats(),
    getMonthlyTrend(),
  ]);

  const recyclingRate = calcPercentage(totalRecycledKg, totalCollectedKg);
  const collectionEfficiency = calcPercentage(tripsCompleted, fullBins || 1);

  return {
    totalCollectedKg: Math.round(totalCollectedKg),
    fullBins: Math.round(fullBins),
    totalRecycledKg: Math.round(totalRecycledKg),
    tripsCompleted: Math.round(tripsCompleted),
    revenueGenerated: Math.round(revenueStats.revenueGenerated),

    pendingComplaints: complaintStatsData.pendingComplaints,
    resolvedComplaints: complaintStatsData.resolvedComplaints,
    workerCount: Math.round(workerCount),
    activeWorkers: Math.round(workerCount),
    recyclingRate,
    collectionEfficiency,

    plasticKg: wasteCategoryStatsData.plasticKg,
    organicKg: wasteCategoryStatsData.organicKg,
    metalKg: wasteCategoryStatsData.metalKg,
    paperKg: wasteCategoryStatsData.paperKg,

    districtStats: districtStatsData.districtStats,
    zoneStats: districtStatsData.districtStats,
    wasteTypeStats: wasteCategoryStatsData.wasteTypeStats,
    complaintStats: complaintStatsData.complaintStats,
    monthlyTrend,

    monthCollectionKg: Math.round(districtStatsData.monthCollectionKg),
    monthRecyclingKg: Math.round(monthRecyclingKg),
    monthComplaints: Math.round(complaintStatsData.monthComplaints),
    monthRevenue: Math.round(revenueStats.monthRevenue),
  };
};