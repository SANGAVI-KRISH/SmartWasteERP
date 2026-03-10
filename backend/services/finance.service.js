const supabase = require("../config/supabase");

function normalizeText(v) {
  return String(v || "").trim();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidTxnType(v) {
  return ["income", "expense"].includes(String(v || "").toLowerCase());
}

function isValidRateType(v) {
  return ["collection", "recycling"].includes(String(v || "").toLowerCase());
}

function isValidWasteType(v) {
  return ["Wet", "Dry", "Plastic"].includes(String(v || ""));
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
      r.source_id,
      r.waste_type,
      r.description,
      r.amount,
      r.quantity_kg,
      r.rate_per_kg
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" ");

    return hay.includes(needle);
  });
}

function normalizeMonthValue(year, month) {
  const y = normalizeText(year);
  const mRaw = normalizeText(month);

  if (!y || !mRaw) return "";

  const mNum = Number(mRaw);
  if (!Number.isInteger(mNum) || mNum < 1 || mNum > 12) return "";

  return `${y}-${String(mNum).padStart(2, "0")}`;
}

async function getLatestRatesMap() {
  const { data, error } = await supabase
    .from("finance_rates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const map = {};
  for (const row of data || []) {
    const waste = normalizeText(row.waste_type);
    const type = normalizeText(row.rate_type).toLowerCase();
    const key = `${waste}__${type}`;

    if (!map[key]) {
      map[key] = toNum(row.rate_per_kg);
    }
  }

  return map;
}

async function getComputedCollectionIncomeRows() {
  const rates = await getLatestRatesMap();

  const { data, error } = await supabase
    .from("collection_records")
    .select("id, date, waste_type, quantity_kg, area, created_at");

  if (error) throw new Error(error.message);

  return (data || []).map((r) => {
    const wasteType = normalizeText(r.waste_type);
    const quantityKg = toNum(r.quantity_kg);
    const ratePerKg = toNum(rates[`${wasteType}__collection`]);
    const amount = quantityKg * ratePerKg;

    return {
      id: `collection-${r.id}`,
      txn_date: r.date || null,
      type: "income",
      category: "collection",
      source_table: "collection_records",
      source_id: r.id,
      waste_type: wasteType || null,
      quantity_kg: quantityKg,
      rate_per_kg: ratePerKg,
      amount,
      description: `Collection income${r.area ? ` - ${r.area}` : ""}`,
      created_at: r.created_at || null,
      is_auto: true
    };
  });
}

async function getComputedRecyclingIncomeRows() {
  const rates = await getLatestRatesMap();

  const { data, error } = await supabase
    .from("recycling_records")
    .select("id, rdate, waste_type, recycled, recycled_kg, created_at");

  if (error) throw new Error(error.message);

  return (data || []).map((r) => {
    const wasteType = normalizeText(r.waste_type);
    const recycledKg = toNum(
      r.recycled !== null && r.recycled !== undefined
        ? r.recycled
        : r.recycled_kg
    );
    const ratePerKg = toNum(rates[`${wasteType}__recycling`]);
    const amount = recycledKg * ratePerKg;

    return {
      id: `recycling-${r.id}`,
      txn_date: r.rdate || null,
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
      is_auto: true
    };
  });
}

async function getManualFinanceRows() {
  const { data, error } = await supabase
    .from("finance_transactions")
    .select("*")
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((r) => ({
    ...r,
    is_auto: false
  }));
}

exports.getSummary = async () => {
  const [collectionIncomeRows, recyclingIncomeRows, manualFinanceRows] =
    await Promise.all([
      getComputedCollectionIncomeRows(),
      getComputedRecyclingIncomeRows(),
      getManualFinanceRows()
    ]);

  const computedIncomeRows = [
    ...collectionIncomeRows,
    ...recyclingIncomeRows
  ];

  const income = computedIncomeRows.reduce(
    (sum, r) => sum + toNum(r.amount),
    0
  );

  const expense = manualFinanceRows
    .filter((r) => String(r.type || "").toLowerCase() === "expense")
    .reduce((sum, r) => sum + toNum(r.amount), 0);

  return {
    income,
    expense,
    profit: income - expense
  };
};

exports.getTransactions = async (filters = {}) => {
  const [collectionIncomeRows, recyclingIncomeRows, manualFinanceRows] =
    await Promise.all([
      getComputedCollectionIncomeRows(),
      getComputedRecyclingIncomeRows(),
      getManualFinanceRows()
    ]);

  let rows = [
    ...collectionIncomeRows,
    ...recyclingIncomeRows,
    ...manualFinanceRows
  ];

  if (filters.type) {
    const type = normalizeText(filters.type).toLowerCase();
    if (isValidTxnType(type)) {
      rows = rows.filter((r) => String(r.type || "").toLowerCase() === type);
    }
  }

  if (filters.category) {
    const cat = normalizeText(filters.category).toLowerCase();
    rows = rows.filter((r) =>
      String(r.category || "").toLowerCase().includes(cat)
    );
  }

  if (filters.from) {
    rows = rows.filter((r) => String(r.txn_date || "") >= String(filters.from));
  }

  if (filters.to) {
    rows = rows.filter((r) => String(r.txn_date || "") <= String(filters.to));
  }

  if (filters.q) {
    rows = applySearch(rows, filters.q);
  }

  rows.sort((a, b) => {
    const d1 = new Date(b.txn_date || b.created_at || 0).getTime();
    const d2 = new Date(a.txn_date || a.created_at || 0).getTime();
    return d1 - d2;
  });

  return rows;
};

exports.createExpense = async (payload, user) => {
  const txn_date = normalizeText(payload.txn_date);
  const category = normalizeText(payload.category).toLowerCase();
  const amount = toNum(payload.amount);
  const description = normalizeText(payload.description);

  if (!txn_date) {
    throw new Error("Expense date is required");
  }

  if (!category) {
    throw new Error("Expense category is required");
  }

  if (amount <= 0) {
    throw new Error("Expense amount must be greater than 0");
  }

  let workerSalaryId = null;
  let salaryMeta = null;

  if (category === "salary") {
    const staffId = normalizeText(payload.staff_id);
    const salaryMonth = normalizeText(payload.salary_month);
    const salaryYear = normalizeText(payload.salary_year);
    const monthValue = normalizeMonthValue(salaryYear, salaryMonth);

    if (!staffId) {
      throw new Error("Staff is required for salary");
    }

    if (!salaryMonth) {
      throw new Error("Salary month is required");
    }

    if (!salaryYear) {
      throw new Error("Salary year is required");
    }

    if (!monthValue) {
      throw new Error("Invalid salary month/year");
    }

    salaryMeta = {
      staffId,
      monthValue,
      totalKg: toNum(payload.total_kg),
      rate: toNum(payload.rate),
      paidAt: new Date().toISOString()
    };

    const { data: existingSalary, error: existingSalaryError } = await supabase
      .from("worker_salary")
      .select("id, worker_id, month")
      .eq("worker_id", salaryMeta.staffId)
      .eq("month", salaryMeta.monthValue)
      .maybeSingle();

    if (existingSalaryError) {
      throw new Error(existingSalaryError.message);
    }

    if (existingSalary?.id) {
      const { data: updatedSalary, error: updateSalaryError } = await supabase
        .from("worker_salary")
        .update({
          total_kg: salaryMeta.totalKg,
          rate: salaryMeta.rate,
          salary: amount,
          status: "Paid",
          paid_at: salaryMeta.paidAt
        })
        .eq("id", existingSalary.id)
        .select("id")
        .single();

      if (updateSalaryError) {
        throw new Error(updateSalaryError.message);
      }

      workerSalaryId = updatedSalary.id;
    } else {
      const { data: insertedSalary, error: insertSalaryError } = await supabase
        .from("worker_salary")
        .insert([
          {
            worker_id: salaryMeta.staffId,
            month: salaryMeta.monthValue,
            total_kg: salaryMeta.totalKg,
            rate: salaryMeta.rate,
            salary: amount,
            status: "Paid",
            paid_at: salaryMeta.paidAt
          }
        ])
        .select("id")
        .single();

      if (insertSalaryError) {
        throw new Error(insertSalaryError.message);
      }

      workerSalaryId = insertedSalary.id;
    }
  }

  const financeRow = {
    txn_date,
    type: "expense",
    category,
    source_table: category === "salary" ? "worker_salary" : null,
    source_id: category === "salary" ? workerSalaryId : null,
    waste_type: null,
    quantity_kg: null,
    rate_per_kg: null,
    amount,
    description:
      description ||
      (category === "salary" && salaryMeta
        ? `Salary for ${salaryMeta.monthValue}`
        : null),
    created_by: user?.id || null
  };

  const { data: financeData, error: financeError } = await supabase
    .from("finance_transactions")
    .insert([financeRow])
    .select()
    .single();

  if (financeError) {
    throw new Error(financeError.message);
  }

  return financeData;
};

exports.getRates = async (filters = {}) => {
  let query = supabase
    .from("finance_rates")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.rate_type) {
    const rateType = normalizeText(filters.rate_type).toLowerCase();
    if (isValidRateType(rateType)) {
      query = query.eq("rate_type", rateType);
    }
  }

  if (filters.waste_type) {
    const wasteType = normalizeText(filters.waste_type);
    if (isValidWasteType(wasteType)) {
      query = query.eq("waste_type", wasteType);
    }
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data || [];
};

exports.createRate = async (payload) => {
  const waste_type = normalizeText(payload.waste_type);
  const rate_type = normalizeText(payload.rate_type).toLowerCase();
  const rate_per_kg = toNum(payload.rate_per_kg);

  if (!isValidWasteType(waste_type)) {
    throw new Error("Invalid waste type");
  }

  if (!isValidRateType(rate_type)) {
    throw new Error("Invalid rate type");
  }

  if (rate_per_kg < 0) {
    throw new Error("Rate per kg must be 0 or more");
  }

  const { data: existing, error: findError } = await supabase
    .from("finance_rates")
    .select("*")
    .eq("waste_type", waste_type)
    .eq("rate_type", rate_type)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (existing?.id) {
    const { data, error } = await supabase
      .from("finance_rates")
      .update({ rate_per_kg })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const row = {
    waste_type,
    rate_per_kg,
    rate_type
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
  const cleanId = normalizeText(id);
  const cleanRate = toNum(rate_per_kg);

  if (!cleanId) {
    throw new Error("Rate id is required");
  }

  if (cleanRate < 0) {
    throw new Error("Rate per kg must be 0 or more");
  }

  const { data, error } = await supabase
    .from("finance_rates")
    .update({
      rate_per_kg: cleanRate
    })
    .eq("id", cleanId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

exports.deleteTransaction = async (id) => {
  const cleanId = normalizeText(id);

  if (!cleanId) {
    throw new Error("Transaction id is required");
  }

  const { data: txn, error: getError } = await supabase
    .from("finance_transactions")
    .select("id, type, category, source_table, source_id")
    .eq("id", cleanId)
    .single();

  if (getError) throw new Error(getError.message);

  if (String(txn?.type || "").toLowerCase() !== "expense") {
    throw new Error("Only manual expense transactions can be deleted");
  }

  if (
    String(txn?.category || "").toLowerCase() === "salary" &&
    String(txn?.source_table || "") === "worker_salary" &&
    txn?.source_id
  ) {
    const { error: deleteSalaryError } = await supabase
      .from("worker_salary")
      .delete()
      .eq("id", txn.source_id);

    if (deleteSalaryError) {
      throw new Error(deleteSalaryError.message);
    }
  }

  const { error } = await supabase
    .from("finance_transactions")
    .delete()
    .eq("id", cleanId);

  if (error) throw new Error(error.message);

  return true;
};