import { apiPost } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function setMessage(msg = "") {
  const el = $("msg");
  if (el) el.textContent = msg;
}

function getValues() {
  return {
    full_name: ($("full_name")?.value || "").trim(),
    role: ($("role")?.value || "").trim(),
    area: ($("area")?.value || "").trim(),
    email: ($("email")?.value || "").trim(),
    password: ($("password")?.value || "").trim(),
    confirmPassword: ($("confirmPassword")?.value || "").trim()
  };
}

function validateForm(values) {
  if (!values.full_name) return "Please enter your full name.";
  if (!values.role) return "Please select a role.";
  if (!values.area) return "Please enter your area.";
  if (!values.email) return "Please enter your email.";

  const emailEl = $("email");
  if (emailEl && !emailEl.checkValidity()) return "Enter a valid email address.";

  if (!values.password) return "Please create a password.";
  if (values.password.length < 6) return "Password must be at least 6 characters.";
  if (!values.confirmPassword) return "Please confirm password.";
  if (values.password !== values.confirmPassword) return "Passwords do not match.";

  return "";
}

async function signUp() {
  const values = getValues();
  const error = validateForm(values);

  if (error) {
    setMessage(error);
    return;
  }

  const btn = $("registerBtn");
  const oldText = btn?.textContent || "Create Account";

  try {
    setMessage("");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creating...";
    }

    const res = await apiPost("/api/auth/register", {
      name: values.full_name,
      role: values.role,
      area: values.area,
      email: values.email,
      password: values.password
    });

    if (!res.ok) {
      setMessage(res.message || "Registration failed");
      return;
    }

    setMessage("Account created successfully. Redirecting to login...");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 900);
  } catch (err) {
    setMessage(err?.message || "Registration failed");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (location.protocol === "file:") {
    alert("Open using Live Server or localhost, not file:/// .");
  }

  $("registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await signUp();
  });
});