const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://smartwaste-backend-xegw.onrender.com";

function getToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

function clearStoredSession() {
  try {
    [
      "token",
      "role",
      "session",
      "smartwaste_session",
      "cloudcrafter_session",
      "user",
      "user_id",
      "area",
      "full_name"
    ].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {}
}

function redirectToLogin() {
  const path = window.location.pathname.toLowerCase();
  if (!path.endsWith("index.html") && !path.endsWith("/")) {
    setTimeout(() => {
      window.location.href = "index.html";
    }, 100);
  }
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders
  };
}

async function parseResponse(res) {
  let data = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Request failed with status ${res.status}`;

    if (res.status === 401) {
      const msg = String(message || "").toLowerCase();

      const shouldClearSession =
        msg.includes("invalid or expired token") ||
        msg.includes("invalid token") ||
        msg.includes("expired token") ||
        msg.includes("jwt expired") ||
        msg.includes("missing authorization token");

      if (shouldClearSession) {
        clearStoredSession();
        // redirectToLogin();
      }
    }

    return {
      ok: false,
      status: res.status,
      message,
      data
    };
  }

  if (data && typeof data === "object" && "ok" in data) {
    return data;
  }

  return {
    ok: true,
    status: res.status,
    data
  };
}

function buildUrl(url) {
  const base = String(API_BASE || "").replace(/\/+$/, "");
  const path = String(url || "").replace(/^\/+/, "");
  return `${base}/${path}`;
}

async function request(url, options = {}) {
  try {
    const res = await fetch(buildUrl(url), options);
    return await parseResponse(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error?.message || "Network error. Backend may be down.",
      data: null
    };
  }
}

export async function apiGet(url) {
  return request(url, {
    method: "GET",
    headers: getAuthHeaders()
  });
}

export async function apiPost(url, body = {}) {
  return request(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
}

export async function apiPut(url, body = {}) {
  return request(url, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
}

export async function apiPatch(url, body = {}) {
  return request(url, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
}

export async function apiDelete(url) {
  return request(url, {
    method: "DELETE",
    headers: getAuthHeaders()
  });
}

export async function apiPostForm(url, formData) {
  const token = getToken();

  return request(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });
}

export function getApiBase() {
  return API_BASE;
}

export { getToken, clearStoredSession, redirectToLogin };