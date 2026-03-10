const supabase = require("../config/supabase");

async function getUserRole(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) {
    const err = new Error("Unable to verify user role");
    err.status = 500;
    throw err;
  }

  return String(data?.role || "").toLowerCase();
}

exports.getComplaints = async ({ q }) => {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  let rows = data || [];

  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => {
      const hay =
        `${r.citizen_name || ""} ${r.area || ""} ${r.issue || ""} ${r.priority || ""} ${r.status || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  return rows;
};

exports.createComplaint = async (payload, user) => {
  const body = {
    citizen_name: String(payload.citizen_name || "").trim(),
    area: String(payload.area || "").trim(),
    issue: String(payload.issue || "").trim(),
    priority: String(payload.priority || "Low").trim(),
    status: "Open",
    created_by: user?.id || null
  };

  if (!body.citizen_name) {
    const err = new Error("Citizen name is required");
    err.status = 400;
    throw err;
  }

  if (!body.area) {
    const err = new Error("Area is required");
    err.status = 400;
    throw err;
  }

  if (!body.issue) {
    const err = new Error("Issue is required");
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from("complaints")
    .insert([body])
    .select()
    .single();

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  return data;
};

exports.updateComplaintStatus = async (id, status, user) => {
  if (!user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const role = await getUserRole(user.id);

  if (role !== "admin") {
    const err = new Error("Only admin can update complaint status");
    err.status = 403;
    throw err;
  }

  const allowedStatuses = ["Open", "In Progress", "Resolved"];
  if (!allowedStatuses.includes(status)) {
    const err = new Error("Invalid complaint status");
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from("complaints")
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  if (!data) {
    const err = new Error("Complaint not found");
    err.status = 404;
    throw err;
  }

  return data;
};

exports.deleteComplaint = async (id, user) => {
  if (!user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  if (!id) {
    const err = new Error("Complaint id is required");
    err.status = 400;
    throw err;
  }

  const role = await getUserRole(user.id);

  if (role !== "admin") {
    const err = new Error("Only admin can delete complaints");
    err.status = 403;
    throw err;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("complaints")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      const err = new Error("Complaint not found");
      err.status = 404;
      throw err;
    }

    const err = new Error(fetchError.message);
    err.status = 500;
    throw err;
  }

  if (!existing) {
    const err = new Error("Complaint not found");
    err.status = 404;
    throw err;
  }

  if (String(existing.status || "").toLowerCase() !== "resolved") {
    const err = new Error("Only resolved complaints can be deleted");
    err.status = 400;
    throw err;
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("complaints")
    .delete()
    .eq("id", id)
    .select("id, status");

  if (deleteError) {
    const err = new Error(deleteError.message);
    err.status = 500;
    throw err;
  }

  if (!deletedRows || deletedRows.length === 0) {
    const err = new Error("Complaint was not deleted");
    err.status = 500;
    throw err;
  }

  return deletedRows[0];
};