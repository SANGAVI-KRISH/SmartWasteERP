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

function normType(t) {
  const s = String(t || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.includes("wet")) return "wet";
  if (s.includes("dry")) return "dry";
  if (s.includes("plastic")) return "plastic";
  return s;
}

function isBinFull(b) {
  const s = String(b.status || b.bin_status || "").toLowerCase();
  return s.includes("full") || s.includes("overflow") || s.includes("100");
}

async function loadRecyclingAuto() {
  const tableCandidates = ["recycling_records", "recycling"];
  const selectCandidates = [
    "id,created_at,waste_type,type,input,input_kg,recycled,recycled_kg,landfill,landfill_kg,total_recycled,total_landfill",
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
        return { table, rows: res.data || [] };
      }
      lastErr = res.error;
    }
  }

  throw new Error(lastErr?.message || "Cannot load recycling data.");
}

exports.getReportSummary = async () => {
  const [{ data: collection, error: cErr }, { data: bins, error: bErr }] = await Promise.all([
    supabase.from("collection_records").select("waste_type, quantity_kg").order("created_at", { ascending: false }),
    supabase.from("bins").select("status,bin_status").order("updated_at", { ascending: false })
  ]);

  if (cErr) throw new Error(cErr.message);
  if (bErr) throw new Error(bErr.message);

  const rec = await loadRecyclingAuto();
  const recycling = rec.rows || [];

  const totalCollected = (collection || []).reduce(
    (sum, r) => sum + (Number(r.quantity_kg) || 0),
    0
  );

  const totalRecycled = recycling.reduce((sum, r) => {
    const v = readCol(r, ["recycled_kg", "recycled", "total_recycled"]);
    return sum + toNum(v);
  }, 0);

  const landfillFromTable = recycling.reduce((sum, r) => {
    const v = readCol(r, ["landfill_kg", "landfill", "total_landfill"]);
    return sum + toNum(v);
  }, 0);

  const totalLandfill = landfillFromTable > 0
    ? landfillFromTable
    : Math.max(0, totalCollected - totalRecycled);

  const fullBins = (bins || []).filter(isBinFull).length;

  const typeTotals = { wet: 0, dry: 0, plastic: 0 };
  (collection || []).forEach(r => {
    const t = normType(r.waste_type);
    const w = Number(r.quantity_kg) || 0;
    if (!typeTotals[t]) typeTotals[t] = 0;
    typeTotals[t] += w;
  });

  const rate = totalCollected > 0 ? ((totalRecycled / totalCollected) * 100).toFixed(1) : "0.0";
  let insight = `Recycling Efficiency: ${rate}% of collected waste is recycled. `;
  if (fullBins > 0) insight += `Priority Alert: ${fullBins} bin(s) are FULL and need pickup. `;
  insight += `Landfill waste: ${Math.round(totalLandfill)} kg. `;
  insight += `(Recycling source: ${rec.table})`;

  return {
    totalCollected,
    totalRecycled,
    totalLandfill,
    fullBins,
    collectionCount: (collection || []).length,
    recyclingCount: recycling.length,
    typeTotals,
    insight
  };
};