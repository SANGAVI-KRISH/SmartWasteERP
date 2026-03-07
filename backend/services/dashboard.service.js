const supabase = require("../config/supabase");

function toNum(x) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const s = String(x).trim();
  if (!s) return 0;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? (parseFloat(m[0]) || 0) : 0;
}

function readCol(row, names) {
  for (const n of names) {
    const v = row?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

async function getTotalCollectedKg() {
  const { data, error } = await supabase
    .from("collection_records")
    .select("quantity_kg");

  if (error) throw new Error(error.message);

  return (data || []).reduce((sum, row) => sum + toNum(row.quantity_kg), 0);
}

async function getFullBins() {
  const { data, error } = await supabase
    .from("bins")
    .select("status");

  if (error) throw new Error(error.message);

  return (data || []).filter((row) => {
    const status = String(row.status || "").trim().toLowerCase();
    return status === "full";
  }).length;
}

async function loadRecyclingAuto() {
  const tableCandidates = ["recycling_records", "recycling", "recycle_records", "recycle"];
  const selectCandidates = [
    "id,created_at,waste_type,type,input,input_kg,weight_kg,quantity_kg,collected_kg,recycled,recycled_kg,total_recycled,total_weight,total_kg,kg",
    "*"
  ];

  let lastErr = null;

  for (const table of tableCandidates) {
    for (const sel of selectCandidates) {
      const res = await supabase
        .from(table)
        .select(sel)
        .order("created_at", { ascending: false });

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

  const kgCols = [
    "recycled_kg", "recycled", "total_recycled",
    "input_kg", "weight_kg", "input", "weight",
    "quantity_kg", "collected_kg", "collection_kg",
    "kg", "waste_kg", "total_weight", "total_kg", "total",
    "recycledKg", "qty_kg", "qty"
  ];

  return rows.reduce((acc, r) => {
    const v = readCol(r, kgCols);
    return acc + toNum(v);
  }, 0);
}

async function getTripsCompleted() {
  const candidates = [
    { table: "staff_tasks", cols: ["status"], doneAny: ["COMPLETED"] },
    { table: "trips", cols: ["status", "trip_status"], doneAny: ["COMPLETED", "DONE"] },
    { table: "trip_logs", cols: ["status", "trip_status", "action"], doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"] },
    { table: "staff_vehicle_logs", cols: ["status", "trip_status", "action"], doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"] },
    { table: "vehicle_logs", cols: ["status", "trip_status", "action"], doneAny: ["COMPLETED", "TRIP_COMPLETED", "DONE"] }
  ];

  for (const t of candidates) {
    const sel = ["id", ...t.cols].join(",");
    const res = await supabase.from(t.table).select(sel);
    if (res.error) continue;

    const rows = res.data || [];
    const doneSet = new Set(t.doneAny.map((x) => String(x).toUpperCase()));

    let count = 0;
    for (const r of rows) {
      let val = "";
      for (const c of t.cols) {
        const v = r?.[c];
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

exports.getDashboardSummary = async () => {
  const [
    totalCollectedKg,
    fullBins,
    totalRecycledKg,
    tripsCompleted
  ] = await Promise.all([
    getTotalCollectedKg(),
    getFullBins(),
    getTotalRecycledKg(),
    getTripsCompleted()
  ]);

  return {
    totalCollectedKg,
    fullBins,
    totalRecycledKg,
    tripsCompleted
  };
};