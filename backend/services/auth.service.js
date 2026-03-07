const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

const JWT_SECRET = process.env.JWT_SECRET || "smartwaste_secret_key";

exports.register = async ({ name, role, area, email, password }) => {
  if (!name || !role || !area || !email || !password) {
    throw new Error("All fields are required");
  }

  if (String(password).length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const allowedRoles = ["admin", "worker", "driver", "recycling_manager"];
  if (!allowedRoles.includes(String(role))) {
    throw new Error("Invalid role selected");
  }

  // Create auth user in Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        role,
        area
      }
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  const user = data.user;

  if (!user) {
    throw new Error("Registration failed");
  }

  // Read profile created by DB trigger
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

  // Login using Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error("Invalid email or password");
  }

  const authUser = data.user;

  if (!authUser) {
    throw new Error("Login failed");
  }

  // Fetch role/details from profiles table
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
    role: profile.role,
    area: profile.area
  };

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });

  return {
    token,
    role: profile.role,
    user
  };
};