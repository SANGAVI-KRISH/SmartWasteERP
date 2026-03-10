const supabase = require("../config/supabase");

async function getMyProfile(user) {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to fetch profile");
  }

  if (!data) {
    throw new Error("Profile not found");
  }

  return {
    id: data.id,
    name: data.full_name || "",
    full_name: data.full_name || "",
    email: data.email || "",
    role: data.role || "",
    area: data.area || ""
  };
}

async function changeMyPassword(user, newPassword) {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const password = String(newPassword || "").trim();

  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password
  });

  if (error) {
    throw new Error(error.message || "Failed to update password");
  }

  return {
    updated: true,
    user_id: data?.user?.id || user.id,
    message: "Password updated successfully"
  };
}

module.exports = {
  getMyProfile,
  changeMyPassword
};