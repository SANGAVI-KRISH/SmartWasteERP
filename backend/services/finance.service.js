const supabase = require("../config/supabase");

function normalizeText(v) {
  return String(v || "").trim();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applySearch(rows, q) {
  const needle = normalizeText(q).toLowerCase();
  if (!needle) return rows;

  return (rows || []).filter((r) => {
    const hay = [
      r.txn_date,
      r.type,
      r.category,
      r.source_table,
      r.waste_type,
      r.description,
      r.amount,
      r.quantity_kg,
      r.rate_per_kg
    ]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");

    return hay.includes(needle);
  });
}

exports.getSummary = async () => {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("type, amount");

  if (error) throw new Error(error.message);

  const rows = data || [];

  const income = rows
    .filter((r) => String(r.type || "").toLowerCase() === "income")
    .reduce((sum, r) => sum + toNum(r.amount), 0);

  const expense = rows
    .filter((r) => String(r.type || "").toLowerCase() === "expense")
    .reduce((sum, r) => sum + toNum(r.amount), 0);

  return {
    income,
    expense,
    profit: income - expense
  };
};

exports.getTransactions = async (filters = {}) => {
  let query = supabase
    .from("finance_transactions")
    .select("*")
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.type) {
    query = query.eq("type", normalizeText(filters.type));
  }

  if (filters.category) {
    query = query.ilike("category", normalizeText(filters.category));
  }

  if (filters.from) {
    query = query.gte("txn_date", filters.from);
  }

  if (filters.to) {
    query = query.lte("txn_date", filters.to);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  let rows = data || [];

  if (filters.q) {
    rows = applySearch(rows, filters.q);
  }

  return rows;
};

exports.createExpense = async (payload, user) => {
  const row = {
    txn_date: payload.txn_date,
    type: "expense",
    category: normalizeText(payload.category),
    source_table: null,
    source_id: null,
    waste_type: null,
    quantity_kg: null,
    rate_per_kg: null,
    amount: toNum(payload.amount),
    description: normalizeText(payload.description),
    created_by: user?.id || null
  };

  const { data, error } = await supabase
    .from("finance_transactions")
    .insert([row])
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

exports.getRates = async (filters = {}) => {
  let query = supabase
    .from("finance_rates")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.rate_type) {
    query = query.eq("rate_type", normalizeText(filters.rate_type));
  }

  if (filters.waste_type) {
    query = query.eq("waste_type", normalizeText(filters.waste_type));
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data || [];
};

exports.createRate = async (payload) => {
  const row = {
    waste_type: normalizeText(payload.waste_type),
    rate_per_kg: toNum(payload.rate_per_kg),
    rate_type: normalizeText(payload.rate_type)
  };

  const { data, error } = await supabase
    .from("finance_rates")
    .insert([row])
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

exports.updateRate = async (id, rate_per_kg) => {
  const { data, error } = await supabase
    .from("finance_rates")
    .update({
      rate_per_kg: toNum(rate_per_kg)
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

exports.deleteTransaction = async (id) => {
  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  return true;
};