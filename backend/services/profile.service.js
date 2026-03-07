const supabase = require("../config/supabase");

exports.getMyProfile = async (user) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile not found");

  return {
    id: data.id,
    name: data.full_name,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    area: data.area
  };
};

exports.changeMyPassword = async (user, newPassword) => {
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  if (!newPassword || String(newPassword).length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  // Passwords are managed by Supabase Auth, not the profiles table.
  // This placeholder avoids crashing until proper auth-password update is added.
  return { updated: false, message: "Password update must be handled through Supabase Auth" };
};