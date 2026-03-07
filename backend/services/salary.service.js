const supabase = require("../config/supabase");

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

function salaryRateForRole(role) {
  const r = String(role || "").toLowerCase();

  // You can change these values anytime
  if (r === "driver") return 3;
  if (r === "worker") return 2;

  return 0;
}

exports.getMySalary = async (user) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) throw new Error(profileErr.message);
  if (!profile) throw new Error("Profile not found");

  const role = String(profile.role || "").toLowerCase();
  const { monthLabel, from, to } = getCurrentMonthRange();

  // Salary only for worker / driver
  if (!["worker", "driver"].includes(role)) {
    return {
      month: monthLabel,
      total_kg: 0,
      rate: 0,
      salary: 0,
      status: "Not Applicable",
      paid_at: null
    };
  }

  const { data: rows, error } = await supabase
    .from("collection_records")
    .select("quantity_kg, date, user_id")
    .eq("user_id", user.id)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);

  const totalKg = (rows || []).reduce(
    (sum, r) => sum + Number(r.quantity_kg || 0),
    0
  );

  const rate = salaryRateForRole(role);
  const salary = totalKg * rate;

  return {
    month: monthLabel,
    total_kg: Number(totalKg.toFixed(2)),
    rate: Number(rate.toFixed(2)),
    salary: Number(salary.toFixed(2)),
    status: "Calculated",
    paid_at: null
  };
};