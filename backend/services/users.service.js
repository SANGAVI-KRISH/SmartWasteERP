const supabase = require("../config/supabase");

exports.getUsers = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((u) => ({
    id: u.id,
    name: u.full_name || "",
    full_name: u.full_name || "",
    email: u.email || "",
    role: u.role || "",
    area: u.area || ""
  }));
};

exports.updateUser = async (id, body) => {
  const allowedRoles = ["admin", "worker", "driver", "recycling_manager"];
  const role = String(body.role || "").trim();
  const area = String(body.area || "").trim();

  if (!allowedRoles.includes(role)) {
    throw new Error("Invalid role");
  }

  const payload = { role, area };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", id)
    .select("id, full_name, email, role, area")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("User not found");

  return {
    id: data.id,
    name: data.full_name || "",
    full_name: data.full_name || "",
    email: data.email || "",
    role: data.role || "",
    area: data.area || ""
  };
};