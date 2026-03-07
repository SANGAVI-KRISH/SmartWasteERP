import { apiGet, apiPost } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function setMessage(msg = "") {
  const el = $("msg");
  if (el) el.textContent = msg;
}

function setChecking(show) {
  if (show) {
    document.body.classList.add("auth-checking");
  } else {
    document.body.classList.remove("auth-checking");
  }
}

function saveSession(data) {
  if (!data) return;

  try {
    if (data.token) localStorage.setItem("token", data.token);
    if (data.role) localStorage.setItem("role", data.role);
    if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
  } catch {}
}

async function checkExistingSession() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || !role) return false;

  const res = await apiGet("/api/auth/me");
  if (!res.ok) {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("user");
    } catch {}
    return false;
  }

  window.location.replace("dashboard.html");
  return true;
}

async function signIn() {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const btn = $("loginBtn");

  if (!email) {
    setMessage("Email is required");
    return;
  }

  if (!password) {
    setMessage("Password is required");
    return;
  }

  setMessage("");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Logging in...";
  }

  try {
    const res = await apiPost("/api/auth/login", { email, password });

    if (!res.ok) {
      setMessage(res.message || "Login failed");
      return;
    }

    const payload = res.data || res;
    saveSession(payload);

    window.location.replace("dashboard.html");
  } catch (err) {
    setMessage(err?.message || "Login failed");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  setChecking(true);

  try {
    const redirected = await checkExistingSession();
    if (redirected) return;
  } catch {}

  setChecking(false);

  $("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await signIn();
  });
});