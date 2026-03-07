// frontend/js/app.js
// Shared frontend helpers after moving page-specific logic to individual files.
// This file no longer uses Supabase directly.

import { apiGet } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  const t = $("toast");
  if (!t) {
    alert(msg);
    return;
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1700);
}

function normalizeRole(roleRaw) {
  const r = String(roleRaw || "").trim().toLowerCase();

  if (
    r === "recycling manager" ||
    r === "recycling-manager" ||
    r === "recycling_manager"
  ) {
    return "recycling_manager";
  }
  if (r === "driver") return "driver";
  if (r === "worker") return "worker";
  if (r === "admin") return "admin";

  return r.replace(/\s+/g, "_");
}

function getStoredRole() {
  const fixed = normalizeRole(localStorage.getItem("role"));
  if (fixed) localStorage.setItem("role", fixed);
  return fixed;
}

const ROLE_ACCESS = {
  admin: [
    "dashboard.html",
    "users.html",
    "tasks.html",
    "collection.html",
    "bins.html",
    "recycling.html",
    "staff_vehicle.html",
    "report.html",
    "map.html",
    "profile.html",
    "complaints.html"
  ],
  recycling_manager: [
    "dashboard.html",
    "tasks.html",
    "recycling.html",
    "report.html",
    "map.html",
    "profile.html"
  ],
  worker: [
    "dashboard.html",
    "tasks.html",
    "collection.html",
    "bins.html",
    "staff_vehicle.html",
    "report.html",
    "map.html",
    "profile.html",
    "complaints.html"
  ],
  driver: [
    "dashboard.html",
    "tasks.html",
    "collection.html",
    "bins.html",
    "staff_vehicle.html",
    "report.html",
    "map.html",
    "profile.html",
    "complaints.html"
  ]
};

function getCurrentPageName() {
  const p = (window.location.pathname || "").split("/").pop() || "";
  return p || "dashboard.html";
}

function isPublicAuthPage() {
  const p = getCurrentPageName();
  return p === "" || p === "index.html" || p === "register.html";
}

function clearSessionStorage() {
  ["user_id", "token", "role", "area", "full_name", "user"].forEach((k) => {
    localStorage.removeItem(k);
  });
}

function setActiveNav() {
  const current = getCurrentPageName();

  document.querySelectorAll(".sidebar .nav a.active").forEach((el) => {
    el.classList.remove("active");
  });

  const links = Array.from(document.querySelectorAll(".sidebar .nav a[href]"));
  const match = links.find((a) => {
    const href = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    return href === current;
  });

  if (match) match.classList.add("active");
}

function applyRoleMenu() {
  const role = getStoredRole();

  document
    .querySelectorAll(".nav-admin,.nav-worker,.nav-driver,.nav-recycling")
    .forEach((el) => {
      el.style.display = "none";
    });

  document.querySelectorAll(".nav-all").forEach((el) => {
    el.style.display = "block";
  });

  if (!role) return;

  if (role === "admin") {
    document
      .querySelectorAll(".nav-admin,.nav-worker,.nav-driver,.nav-recycling")
      .forEach((el) => {
        el.style.display = "block";
      });
    return;
  }

  const cls =
    role === "recycling_manager"
      ? "nav-recycling"
      : role === "worker"
        ? "nav-worker"
        : role === "driver"
          ? "nav-driver"
          : "nav-" + role;

  document.querySelectorAll("." + cls).forEach((el) => {
    el.style.display = "block";
  });
}

function initProfileMenu() {
  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileDropdown");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });

  menu.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => {
    menu.style.display = "none";
  });
}

async function protectPage(allowedRoles = null, opts = {}) {
  const { silent = false } = opts || {};
  const page = getCurrentPageName();

  if (isPublicAuthPage()) {
    const token = localStorage.getItem("token");
    return !!token;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    clearSessionStorage();
    if (!silent) window.location.replace("index.html");
    return false;
  }

  const me = await apiGet("/api/auth/me");
  if (!me.ok) {
    clearSessionStorage();
    if (!silent) window.location.replace("index.html");
    return false;
  }

  const role = normalizeRole(me?.data?.role || localStorage.getItem("role"));
  if (role) localStorage.setItem("role", role);

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const normalizedAllowed = allowedRoles.map(normalizeRole);
    if (!normalizedAllowed.includes(role)) {
      if (!silent) window.location.replace("dashboard.html");
      return false;
    }
    return true;
  }

  const allowedPages = ROLE_ACCESS[role] || [];
  if (allowedPages.length && !allowedPages.includes(page)) {
    if (!silent) window.location.replace("dashboard.html");
    return false;
  }

  return true;
}

function logout() {
  clearSessionStorage();
  window.location.href = "index.html";
}

// expose globals for pages that still call through window
window.toast = toast;
window.normalizeRole = normalizeRole;
window.getStoredRole = getStoredRole;
window.setActiveNav = setActiveNav;
window.applyRoleMenu = applyRoleMenu;
window.protectPage = protectPage;
window.initProfileMenu = initProfileMenu;
window.logout = logout;

document.addEventListener("DOMContentLoaded", async () => {
  const page = getCurrentPageName();
  if (page === "index.html" || page === "register.html" || page === "") return;

  try {
    applyRoleMenu();
  } catch {}

  try {
    await protectPage();
  } catch {}

  try {
    initProfileMenu();
  } catch {}

  try {
    setActiveNav();
  } catch {}

  try {
    document.getElementById("logoutBtnTop")?.addEventListener("click", logout);
    document.getElementById("logoutBtnSidebar")?.addEventListener("click", logout);
  } catch {}
});

export {
  toast,
  normalizeRole,
  getStoredRole,
  setActiveNav,
  applyRoleMenu,
  protectPage,
  initProfileMenu,
  logout
};