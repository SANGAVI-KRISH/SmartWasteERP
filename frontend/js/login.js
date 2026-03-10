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

function clearSession() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
}

function extractSessionPayload(res) {
  const root = res && typeof res === "object" ? res : {};
  const data = root.data && typeof root.data === "object" ? root.data : {};

  const token =
    data.token ||
    root.token ||
    data.accessToken ||
    root.accessToken ||
    data.access_token ||
    root.access_token ||
    null;

  const user =
    data.user ||
    root.user ||
    null;

  const role =
    data.role ||
    root.role ||
    user?.role ||
    null;

  return { token, role, user };
}

function saveSession(payload) {
  const { token, role, user } = extractSessionPayload(payload);

  if (!token) return false;

  try {
    localStorage.setItem("token", token);

    if (role) {
      localStorage.setItem("role", String(role).toLowerCase());
    }

    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    }
  } catch {}

  return true;
}

async function checkExistingSession() {
  const token = localStorage.getItem("token");

  if (!token) return false;

  const res = await apiGet("/api/me");

  if (!res.ok) {
    clearSession();
    return false;
  }

  const payload = extractSessionPayload(res);

  if (payload.role && !localStorage.getItem("role")) {
    try {
      localStorage.setItem("role", String(payload.role).toLowerCase());
    } catch {}
  }

  if (payload.user) {
    try {
      localStorage.setItem("user", JSON.stringify(payload.user));
    } catch {}
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
    const res = await apiPost("/api/login", { email, password });

    if (!res.ok) {
      setMessage(res.message || "Login failed");
      return;
    }

    const saved = saveSession(res);

    if (!saved) {
      console.error("Login response did not contain token/role in expected shape:", res);
      setMessage("Login succeeded, but session token was not returned properly.");
      clearSession();
      return;
    }

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
  } catch {
    clearSession();
  }

  setChecking(false);

  $("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await signIn();
  });
});