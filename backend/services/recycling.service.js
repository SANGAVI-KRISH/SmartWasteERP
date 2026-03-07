const supabase = require("../config/supabase");

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

async function getRecycledSets() {
  const recycledPickupIds = new Set();
  const recycledManualIds = new Set();

  const selectCandidates = [
    "id,pickup_task_id,task_id,collection_record_id,created_at",
    "*"
  ];

  for (const s of selectCandidates) {
    const rr = await supabase
      .from("recycling_records")
      .select(s)
      .order("created_at", { ascending: false });

    if (!rr.error) {
      (rr.data || []).forEach(r => {
        const pid = r.pickup_task_id ?? r.task_id;
        if (pid) recycledPickupIds.add(String(pid));
        if (r.collection_record_id) recycledManualIds.add(String(r.collection_record_id));
      });
      break;
    }
  }

  return { recycledPickupIds, recycledManualIds };
}

exports.getAvailableSources = async () => {
  const { recycledPickupIds, recycledManualIds } = await getRecycledSets();
  const result = [];

  const pickupRes = await supabase
    .from("pickup_tasks")
    .select("*")
    .eq("status", "COLLECTED")
    .order("created_at", { ascending: false });

  const pickupRows = pickupRes.error ? [] : (pickupRes.data || []);

  let collectionData = [];
  const manualSelects = [
    "id,created_at,date,bin_id,area,quantity_kg,collected_kg,input_kg,weight_kg,collection,collection_kg,kg,waste_kg,waste_qty,total_kg,total_weight,weight,quantity,qty,status,collection_status,is_manual,manual,task_id,pickup_task_id,collection_visible,visible,recycled",
    "*"
  ];

  for (const selStr of manualSelects) {
    const res = await supabase
      .from("collection_records")
      .select(selStr)
      .order("created_at", { ascending: false });

    if (!res.error) {
      collectionData = res.data || [];
      break;
    }
  }

  const manualRows = (collectionData || []).filter(r => {
    const manualFlag = r.is_manual === true || r.manual === true;
    const noTask = r.task_id == null && r.pickup_task_id == null;
    const st = String(r.status ?? r.collection_status ?? "").toUpperCase().trim();
    const notRecycledByStatus = st ? st !== "RECYCLED" : true;
    const visibleOk =
      (r.collection_visible === undefined || r.collection_visible === null || r.collection_visible === true) &&
      (r.visible === undefined || r.visible === null || r.visible === true);
    const notRecycledFlag = (r.recycled === undefined || r.recycled === null) ? true : (r.recycled !== true);
    const notAlreadyInRecycling = !recycledManualIds.has(String(r.id));

    return (manualFlag || noTask) && notRecycledByStatus && notRecycledFlag && visibleOk && notAlreadyInRecycling;
  });

  for (const t of pickupRows) {
    const taskId = t.id || t.task_id || "";
    if (!taskId) continue;
    if (recycledPickupIds.has(String(taskId))) continue;

    const binId = t.bin_id || "";
    const area = t.area || t.location || t.zone || "";
    const kg = readKg(t);

    result.push({
      value: `pickup:${taskId}`,
      kind: "pickup",
      kg,
      label: [
        "(COLLECTED)",
        `Task: ${taskId}`,
        binId ? `Bin: ${binId}` : null,
        area ? `Area: ${area}` : null,
        `Kg: ${kg}`
      ].filter(Boolean).join(" | ")
    });
  }

  for (const r of manualRows) {
    const recId = r.id || "";
    if (!recId) continue;
    if (recycledManualIds.has(String(recId))) continue;

    const binId = r.bin_id || r.bin || "";
    const area = r.area || r.location || r.zone || "";
    const kg = readKg(r);
    const date = r.date || (r.created_at || "").slice(0, 10) || "";

    result.push({
      value: `manual:${recId}`,
      kind: "manual",
      kg,
      label: [
        "(MANUAL)",
        `Collection: ${recId}`,
        date ? `Date: ${date}` : null,
        binId ? `Bin: ${binId}` : null,
        area ? `Area: ${area}` : null,
        `Kg: ${kg}`
      ].filter(Boolean).join(" | ")
    });
  }

  return result;
};

async function tryInsertRecycling(payloads) {
  let lastErr = null;
  for (const p of payloads) {
    const res = await supabase.from("recycling_records").insert([p]).select();
    if (!res.error) return res.data?.[0] || null;
    lastErr = res.error;
  }
  throw new Error(lastErr?.message || "Insert failed.");
}

exports.createRecyclingRecord = async (body, user) => {
  const date = body.date;
  const type = body.waste_type;
  const inputKg = Number(body.input_kg);
  const recycledKg = Number(body.recycled_kg);
  const landfillKg = Number(body.landfill_kg);
  const raw = body.source_value || "";

  if (!raw) throw new Error("Please select a COLLECTED task / Manual Collection.");
  if (!type) throw new Error("Please select waste type.");
  if (!(inputKg > 0)) throw new Error("Input (kg) must be greater than 0.");
  if (recycledKg < 0 || landfillKg < 0) throw new Error("Kg values cannot be negative.");
  if ((recycledKg + landfillKg) > inputKg) {
    throw new Error("Recycled + Landfill must not exceed Input.");
  }

  const [kind, id] = String(raw).split(":");
  if (!kind || !id) throw new Error("Invalid dropdown value.");

  const payloads = [
    {
      rdate: date,
      waste_type: type,
      input: inputKg,
      recycled: recycledKg,
      landfill: landfillKg,
      pickup_task_id: kind === "pickup" ? id : null,
      task_id: kind === "pickup" ? id : null,
      collection_record_id: kind === "manual" ? id : null,
      user_id: user?.id || null
    },
    {
      date,
      type,
      input: inputKg,
      recycled: recycledKg,
      landfill: landfillKg,
      pickup_task_id: kind === "pickup" ? id : null,
      task_id: kind === "pickup" ? id : null,
      collection_record_id: kind === "manual" ? id : null,
      user_id: user?.id || null
    },
    {
      rdate: date,
      waste_type: type,
      input_kg: inputKg,
      recycled_kg: recycledKg,
      landfill_kg: landfillKg,
      pickup_task_id: kind === "pickup" ? id : null,
      task_id: kind === "pickup" ? id : null,
      collection_record_id: kind === "manual" ? id : null,
      user_id: user?.id || null
    },
    {
      rdate: date,
      waste_type: type,
      input: inputKg,
      recycled: recycledKg,
      landfill: landfillKg,
      user_id: user?.id || null
    }
  ];

  const inserted = await tryInsertRecycling(payloads);

  if (kind === "pickup") {
    await supabase.from("pickup_tasks").update({ status: "RECYCLED" }).eq("id", id);
  } else {
    await supabase.from("collection_records").update({ status: "RECYCLED" }).eq("id", id);
  }

  return inserted;
};

exports.getRecyclingRecords = async (query, user) => {
  const q = String(query.q || "").toLowerCase().trim();
  const onlyMine = String(query.onlyMine || "").toLowerCase() === "true";

  const selects = [
    "id,rdate,waste_type,input,recycled,landfill,created_at,user_id",
    "id,date,type,input,recycled,landfill,created_at,user_id",
    "id,rdate,waste_type,input_kg,recycled_kg,landfill_kg,created_at,user_id",
    "*"
  ];

  let data = null;
  for (const selStr of selects) {
    const res = await supabase
      .from("recycling_records")
      .select(selStr)
      .order("created_at", { ascending: false });

    if (!res.error) {
      data = res.data || [];
      break;
    }
  }

  if (!data) throw new Error("Could not read recycling records.");

  let rows = data.map(r => ({
    date: r.rdate ?? r.date ?? "",
    type: r.waste_type ?? r.type ?? "",
    input: r.input ?? r.input_kg ?? "",
    recycled: r.recycled ?? r.recycled_kg ?? "",
    landfill: r.landfill ?? r.landfill_kg ?? "",
    user_id: r.user_id ?? null
  }));

  if (onlyMine && user?.id) {
    rows = rows.filter(r => String(r.user_id || "") === String(user.id));
  }

  if (q) {
    rows = rows.filter(r => (`${r.date} ${r.type}`).toLowerCase().includes(q));
  }

  return rows;
};