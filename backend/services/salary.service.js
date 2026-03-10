const supabase = require("../config/supabase");

function monthNumberToName(month) {
  const names = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  return names[Number(month)] || "-";
}

function parseMonthLabel(monthLabel) {
  const s = String(monthLabel || "").trim();

  if (!/^\d{4}-\d{2}$/.test(s)) {
    return { year: null, month: null };
  }

  const [year, month] = s.split("-");
  return {
    year: Number(year),
    month: Number(month)
  };
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    monthLabel: `${year}-${String(month + 1).padStart(2, "0")}`,
    from: fmt(start),
    to: fmt(end)
  };
}

function getMonthRange(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return null;
  }

  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);

  const fmt = (d) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  return {
    monthLabel: `${y}-${String(m).padStart(2, "0")}`,
    from: fmt(start),
    to: fmt(end)
  };
}

function salaryRateForRole(role) {
  const r = String(role || "").toLowerCase();

  if (r === "driver") return 3;
  if (r === "worker") return 2;
  if (r === "recycling_manager") return 0;

  return 0;
}

async function getProfile(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile) throw new Error("Profile not found");

  return profile;
}

async function getSavedSalaryForMonth(workerId, monthLabel) {
  const { data, error } = await supabase
    .from("worker_salary")
    .select("*")
    .eq("worker_id", workerId)
    .eq("month", monthLabel)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getLatestSavedSalary(workerId) {
  const { data, error } = await supabase
    .from("worker_salary")
    .select("*")
    .eq("worker_id", workerId)
    .order("month", { ascending: false })
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getAllSavedSalaries(workerId) {
  const { data, error } = await supabase
    .from("worker_salary")
    .select("*")
    .eq("worker_id", workerId)
    .order("month", { ascending: false })
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

async function getCollectedKgForMonth(userId, from, to) {
  const { data, error } = await supabase
    .from("collection_records")
    .select("quantity_kg, date, user_id")
    .eq("user_id", userId)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);

  return (data || []).reduce((sum, r) => sum + Number(r.quantity_kg || 0), 0);
}

function mapSalaryRow(row, fallbackMonth) {
  const label = row?.month || fallbackMonth || "-";
  const parts = parseMonthLabel(label);

  return {
    month: parts.month || label,
    year: parts.year || "-",
    month_label: label,
    month_name: parts.month ? monthNumberToName(parts.month) : String(label),
    total_waste_collected: Number(row?.total_kg || 0),
    total_salary: Number(row?.salary || 0),
    status: row?.status || "Paid",
    paid_at: row?.paid_at || null
  };
}

function matchesFilters(row, filters = {}) {
  const monthFilter = filters?.month ? Number(filters.month) : null;
  const yearFilter = filters?.year ? Number(filters.year) : null;
  const statusFilter = String(filters?.status || "").trim().toLowerCase();

  const rowMonth = Number(row.month);
  const rowYear = Number(row.year);
  const rowStatus = String(row.status || "").trim().toLowerCase();

  if (monthFilter && rowMonth !== monthFilter) return false;
  if (yearFilter && rowYear !== yearFilter) return false;
  if (statusFilter && rowStatus !== statusFilter) return false;

  return true;
}

async function getCalculatedSalaryHistory(userId, role, filters = {}) {
  if (!["worker", "driver"].includes(String(role || "").toLowerCase())) {
    return [];
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = currentYear - 2;
  const out = [];

  for (let year = currentYear; year >= startYear; year--) {
    for (let month = 12; month >= 1; month--) {
      if (year === currentYear && month > now.getMonth() + 1) continue;

      const range = getMonthRange(year, month);
      if (!range) continue;

      const totalKg = await getCollectedKgForMonth(userId, range.from, range.to);
      const rate = salaryRateForRole(role);
      const salary = totalKg * rate;

      out.push({
        month,
        year,
        month_label: range.monthLabel,
        month_name: monthNumberToName(month),
        total_waste_collected: Number(totalKg.toFixed(2)),
        total_salary: Number(salary.toFixed(2)),
        status: totalKg > 0 ? "Calculated" : "No Data",
        paid_at: null
      });
    }
  }

  return out.filter((row) => matchesFilters(row, filters));
}

function buildFilterText(filters = {}) {
  const filterParts = [];

  if (filters.month) filterParts.push(`Month: ${monthNumberToName(filters.month)}`);
  if (filters.year) filterParts.push(`Year: ${filters.year}`);
  if (filters.status) filterParts.push(`Status: ${filters.status}`);

  return filterParts.length ? filterParts.join(" | ") : "All Records";
}

exports.getMySalary = async (user) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const profile = await getProfile(user.id);
  const role = String(profile.role || "").toLowerCase();
  const { monthLabel, from, to } = getCurrentMonthRange();

  const currentMonthSalary = await getSavedSalaryForMonth(user.id, monthLabel);
  if (currentMonthSalary) {
    return mapSalaryRow(currentMonthSalary, monthLabel);
  }

  const latestSavedSalary = await getLatestSavedSalary(user.id);
  if (latestSavedSalary) {
    return mapSalaryRow(latestSavedSalary, monthLabel);
  }

  if (!["worker", "driver"].includes(role)) {
    const parts = parseMonthLabel(monthLabel);
    return {
      month: parts.month || "-",
      year: parts.year || "-",
      month_label: monthLabel,
      month_name: parts.month ? monthNumberToName(parts.month) : "-",
      total_waste_collected: 0,
      total_salary: 0,
      status: "Not Applicable",
      paid_at: null
    };
  }

  const totalKg = await getCollectedKgForMonth(user.id, from, to);
  const rate = salaryRateForRole(role);
  const salary = totalKg * rate;
  const parts = parseMonthLabel(monthLabel);

  return {
    month: parts.month || "-",
    year: parts.year || "-",
    month_label: monthLabel,
    month_name: parts.month ? monthNumberToName(parts.month) : "-",
    total_waste_collected: Number(totalKg.toFixed(2)),
    total_salary: Number(salary.toFixed(2)),
    status: totalKg > 0 ? "Calculated" : "No Data",
    paid_at: null
  };
};

exports.getMySalaryHistory = async (user, filters = {}) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const profile = await getProfile(user.id);
  const role = String(profile.role || "").toLowerCase();

  const savedRows = await getAllSavedSalaries(user.id);
  let rows = (savedRows || []).map((row) => mapSalaryRow(row, row.month));

  rows = rows.filter((row) => matchesFilters(row, filters));

  if (!rows.length) {
    rows = await getCalculatedSalaryHistory(user.id, role, filters);
  }

  rows.sort((a, b) => {
    if (Number(b.year) !== Number(a.year)) {
      return Number(b.year) - Number(a.year);
    }
    return Number(b.month) - Number(a.month);
  });

  return rows;
};

exports.exportMySalaryPdf = async (user, filters = {}) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const profile = await getProfile(user.id);
  const rows = await exports.getMySalaryHistory(user, filters);

  const totalSalary = rows.reduce(
    (sum, row) => sum + Number(row.total_salary || 0),
    0
  );

  return {
    profile,
    rows: rows.map((row) => ({
      ...row,
      month_name: row.month_name || monthNumberToName(row.month)
    })),
    summary: {
      totalRecords: rows.length,
      totalSalary
    },
    filterText: buildFilterText(filters)
  };
};