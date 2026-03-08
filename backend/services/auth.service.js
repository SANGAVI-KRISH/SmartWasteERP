const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in environment variables");
}

exports.register = async ({ name, role, area, email, password }) => {
  if (!name || !role || !area || !email || !password) {
    throw new Error("All fields are required");
  }

  if (String(password).length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const allowedRoles = ["admin", "worker", "driver", "recycling_manager"];
  const normalizedRole = String(role).trim().toLowerCase();

  if (!allowedRoles.includes(normalizedRole)) {
    throw new Error("Invalid role selected");
  }

  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim(),
    password: String(password),
    options: {
      data: {
        full_name: String(name).trim(),
        role: normalizedRole,
        area: String(area).trim()
      }
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = data?.user;

  if (!user) {
    throw new Error("Registration failed");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return profile;
};

exports.login = async ({ email, password }) => {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password)
  });

  if (error) {
    throw new Error("Invalid email or password");
  }

  const authUser = data?.user;

  if (!authUser) {
    throw new Error("Login failed");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, area")
    .eq("id", authUser.id)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const user = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: String(profile.role || "").toLowerCase(),
    area: profile.area
  };

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      area: user.area
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    token,
    role: user.role,
    user
  };
};