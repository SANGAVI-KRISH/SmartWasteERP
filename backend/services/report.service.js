const supabase = require("../config/supabase");

/* -------------------- HELPERS -------------------- */

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
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
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
  const s = String(
    b?.status ?? b?.bin_status ?? b?.fill_status ?? ""
  ).toLowerCase();

  return (
    s.includes("full") ||
    s.includes("overflow") ||
    s.includes("100") ||
    s.includes("needs collection")
  );
}

/* -------------------- COLLECTION LOADER -------------------- */

async function loadCollectionAuto() {
  const tableCandidates = [
    "collection_records",
    "collection",
    "collections"
  ];

  const selectCandidates = [
    "id,created_at,waste_type,type,quantity_kg,collected_kg,input_kg,weight_kg,weight,kg,quantity,qty",
    "*"
  ];

  let lastErr = null;

  for (const table of tableCandidates) {
    for (const sel of selectCandidates) {
      let query = supabase.from(table).select(sel);

      const ordered = await query.order("created_at", { ascending: false });
      if (!ordered.error) {
        return { table, rows: ordered.data || [] };
      }

      if (
        String(ordered.error?.message || "").toLowerCase().includes("created_at")
      ) {
        const plain = await supabase.from(table).select(sel);
        if (!plain.error) {
          return { table, rows: plain.data || [] };
        }
        lastErr = plain.error;
      } else {
        lastErr = ordered.error;
      }
    }
  }

  throw new Error(lastErr?.message || "Cannot load collection data.");
}

function readCollectionKg(row) {
  return toNum(
    readCol(row, [
      "quantity_kg",
      "collected_kg",
      "input_kg",
      "weight_kg",
      "collection_kg",
      "kg",
      "weight",
      "quantity",
      "qty"
    ])
  );
}

function readCollectionType(row) {
  return readCol(row, ["waste_type", "type", "category", "waste_category"]) || "unknown";
}

/* -------------------- RECYCLING LOADER -------------------- */

async function loadRecyclingAuto() {
  const tableCandidates = ["recycling_records", "recycling"];
  const selectCandidates = [
    "id,created_at,waste_type,type,input,input_kg,recycled,recycled_kg,landfill,landfill_kg,total_recycled,total_landfill,status,final_action,action",
    "*"
  ];

  let lastErr = null;

  for (const table of tableCandidates) {
    for (const sel of selectCandidates) {
      let query = supabase.from(table).select(sel);

      const ordered = await query.order("created_at", { ascending: false });
      if (!ordered.error) {
        return { table, rows: ordered.data || [] };
      }

      if (
        String(ordered.error?.message || "").toLowerCase().includes("created_at")
      ) {
        const plain = await supabase.from(table).select(sel);
        if (!plain.error) {
          return { table, rows: plain.data || [] };
        }
        lastErr = plain.error;
      } else {
        lastErr = ordered.error;
      }
    }
  }

  throw new Error(lastErr?.message || "Cannot load recycling data.");
}

function readRecycledKg(row) {
  return toNum(
    readCol(row, [
      "recycled_kg",
      "recycled",
      "total_recycled"
    ])
  );
}

function readLandfillKg(row) {
  return toNum(
    readCol(row, [
      "landfill_kg",
      "landfill",
      "total_landfill"
    ])
  );
}

/* -------------------- BINS LOADER -------------------- */

async function loadBinsAuto() {
  const table = "bins";

  const selectCandidates = [
    "id,bin_id,status",
    "*"
  ];

  let lastErr = null;

  for (const sel of selectCandidates) {
    let query = supabase.from(table).select(sel);

    const ordered = await query.order("updated_at", { ascending: false });
    if (!ordered.error) {
      return { table, rows: ordered.data || [] };
    }

    if (
      String(ordered.error?.message || "").toLowerCase().includes("updated_at")
    ) {
      const plain = await supabase.from(table).select(sel);
      if (!plain.error) {
        return { table, rows: plain.data || [] };
      }
      lastErr = plain.error;
    } else {
      lastErr = ordered.error;
    }
  }

  throw new Error(lastErr?.message || "Cannot load bins data.");
}

/* -------------------- REPORT SUMMARY -------------------- */

async function getReportSummary() {
  const [collectionRes, recyclingRes, binsRes] = await Promise.all([
    loadCollectionAuto(),
    loadRecyclingAuto(),
    loadBinsAuto()
  ]);

  const collection = collectionRes.rows || [];
  const recycling = recyclingRes.rows || [];
  const bins = binsRes.rows || [];

  const totalCollected = collection.reduce((sum, row) => {
    return sum + readCollectionKg(row);
  }, 0);

  const totalRecycled = recycling.reduce((sum, row) => {
    return sum + readRecycledKg(row);
  }, 0);

  const landfillFromTable = recycling.reduce((sum, row) => {
    return sum + readLandfillKg(row);
  }, 0);

  const totalLandfill =
    landfillFromTable > 0
      ? landfillFromTable
      : Math.max(0, totalCollected - totalRecycled);

  const fullBins = bins.filter(isBinFull).length;

  const typeTotals = { wet: 0, dry: 0, plastic: 0 };

  collection.forEach((row) => {
    const type = normType(readCollectionType(row));
    const kg = readCollectionKg(row);

    if (!typeTotals[type]) typeTotals[type] = 0;
    typeTotals[type] += kg;
  });

  const recycleRate =
    totalCollected > 0
      ? ((totalRecycled / totalCollected) * 100).toFixed(1)
      : "0.0";

  let insight = `Recycling Efficiency: ${recycleRate}% of collected waste is recycled. `;
  if (fullBins > 0) {
    insight += `Priority Alert: ${fullBins} bin(s) are FULL and need pickup. `;
  } else {
    insight += `No full bins currently need urgent pickup. `;
  }
  insight += `Landfill waste: ${Math.round(totalLandfill)} kg. `;
  insight += `(Collection source: ${collectionRes.table}, Recycling source: ${recyclingRes.table})`;

  return {
    totalCollected,
    totalRecycled,
    totalLandfill,
    fullBins,
    collectionCount: collection.length,
    recyclingCount: recycling.length,
    typeTotals,
    insight
  };
}

module.exports = {
  getReportSummary
};