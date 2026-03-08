const supabase = require("../config/supabase");

/* ---------------------------
   HELPERS
---------------------------- */

function normalizeDate(input) {
  const v = String(input || "").trim();

  if (!v) return new Date().toISOString().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  return new Date().toISOString().slice(0, 10);
}

function toNum(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;

  const s = String(x).trim();
  if (!s) return null;

  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;

  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function toInt(x) {
  const n = Number(x);
  return Number.isInteger(n) ? n : null;
}

function readKg(obj) {
  const candidates = [
    obj?.quantity_kg,
    obj?.collected_kg,
    obj?.input_kg,
    obj?.weight_kg,
    obj?.collection,
    obj?.collection_kg,
    obj?.kg,
    obj?.waste_kg,
    obj?.waste_qty,
    obj?.total_kg,
    obj?.total_weight,
    obj?.weight,
    obj?.quantity,
    obj?.qty
  ];

  for (const v of candidates) {
    const n = toNum(v);
    if (n !== null) return n;
  }

  return 0;
}

function normalizeText(v) {
  return String(v || "").trim();
}

/* ---------------------------
   FIND ALREADY RECYCLED
---------------------------- */

async function getRecycledCollectionIds() {
  const recycledIds = new Set();

  const { data, error } = await supabase
    .from("recycling_records")
    .select("collection_record_id");

  if (!error && data) {
    data.forEach(r => {
      if (r.collection_record_id !== null) {
        recycledIds.add(String(r.collection_record_id));
      }
    });
  }

  return recycledIds;
}

/* ---------------------------
   AVAILABLE COLLECTION SOURCES
---------------------------- */

exports.getAvailableSources = async () => {

  const recycledIds = await getRecycledCollectionIds();

  const { data, error } = await supabase
    .from("collection_records")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data || []).filter(r => {

    const id = String(r.id || "");

    if (recycledIds.has(id)) return false;

    const kg = readKg(r);
    if (!(kg > 0)) return false;

    return true;
  });

  return rows.map(r => {

    const kg = readKg(r);

    return {
      value: `collection:${r.id}`,
      kg,
      waste_type: normalizeText(r.waste_type),
      label: [
        `Date: ${r.date}`,
        `Area: ${r.area}`,
        `Type: ${r.waste_type}`,
        r.vehicle_id ? `Vehicle: ${r.vehicle_id}` : null,
        `Kg: ${kg}`
      ].filter(Boolean).join(" | ")
    };

  });
};

/* ---------------------------
   INSERT RECYCLING
---------------------------- */

async function insertRecycling(payload) {

  const { data, error } = await supabase
    .from("recycling_records")
    .insert([payload])
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
}

/* ---------------------------
   MARK COLLECTION RECYCLED
---------------------------- */

async function markCollectionRecycled(collectionId) {

  await supabase
    .from("collection_records")
    .update({
      status: "RECYCLED",
      recycled: true
    })
    .eq("id", collectionId);

}

/* ---------------------------
   CREATE RECYCLING RECORD
---------------------------- */

exports.createRecyclingRecord = async (body) => {

  const date = normalizeDate(body?.date);

  const recycledKg = Number(body?.recycled_kg);
  const landfillKg = Number(body?.landfill_kg);

  const raw = body?.source_value;

  if (!raw) throw new Error("Please select collection record.");

  const [kind, rawId] = raw.split(":");
  const collectionId = toInt(rawId);

  if (kind !== "collection") {
    throw new Error("Invalid source.");
  }

  const { data: collectionRow, error } = await supabase
    .from("collection_records")
    .select("*")
    .eq("id", collectionId)
    .single();

  if (error) throw new Error(error.message);

  const inputKg = readKg(collectionRow);

  if (recycledKg + landfillKg > inputKg) {
    throw new Error("Recycled + Landfill exceeds input.");
  }

  const payload = {
    rdate: date,
    waste_type: collectionRow.waste_type,
    input: inputKg,
    recycled: recycledKg,
    landfill: landfillKg,
    collection_record_id: collectionId
  };

  const inserted = await insertRecycling(payload);

  await markCollectionRecycled(collectionId);

  return {
    id: inserted.id,
    date: inserted.rdate,
    type: inserted.waste_type,
    input: inserted.input,
    recycled: inserted.recycled,
    landfill: inserted.landfill
  };
};

/* ---------------------------
   GET RECYCLING RECORDS
---------------------------- */

exports.getRecyclingRecords = async (query) => {

  const q = String(query?.q || "").toLowerCase();

  const { data, error } = await supabase
    .from("recycling_records")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  let rows = (data || []).map(r => ({
    id: r.id,
    date: r.rdate,
    type: r.waste_type,
    input: r.input,
    recycled: r.recycled,
    landfill: r.landfill
  }));

  if (q) {
    rows = rows.filter(r =>
      `${r.date} ${r.type}`.toLowerCase().includes(q)
    );
  }

  return rows;
};

/* ---------------------------
   DELETE RECYCLING
---------------------------- */

exports.deleteRecyclingRecord = async (id) => {

  const { data, error } = await supabase
    .from("recycling_records")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from("recycling_records")
    .delete()
    .eq("id", id);

  if (data.collection_record_id) {

    await supabase
      .from("collection_records")
      .update({
        status: "COLLECTED",
        recycled: false
      })
      .eq("id", data.collection_record_id);

  }

  return { ok: true };
};