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
  const fixed = normalizeRole(
    localStorage.getItem("role") || sessionStorage.getItem("role")
  );

  if (fixed) {
    localStorage.setItem("role", fixed);
    sessionStorage.setItem("role", fixed);
  }

  return fixed;
}

const ROLE_ACCESS = {
  admin: [
    "dashboard.html",
    "map.html",
    "users.html",
    "collection.html",
    "bins.html",
    "staff_vehicle.html",
    "recycling.html",
    "finance.html",
    "report.html",
    "complaints.html",
    "profile.html"
  ],
  worker: [
    "dashboard.html",
    "map.html",
    "tasks.html",
    "collection.html",
    "bins.html",
    "report.html",
    "complaints.html",
    "profile.html"
  ],
  driver: [
    "dashboard.html",
    "map.html",
    "tasks.html",
    "collection.html",
    "bins.html",
    "report.html",
    "complaints.html",
    "profile.html"
  ],
  recycling_manager: [
    "dashboard.html",
    "map.html",
    "recycling.html",
    "report.html",
    "complaints.html",
    "profile.html"
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
  [
    "user_id",
    "token",
    "role",
    "area",
    "full_name",
    "user",
    "session",
    "smartwaste_session",
    "cloudcrafter_session"
  ].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
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

  if (match && !match.classList.contains("role-hidden")) {
    match.classList.add("active");
  }
}

function getRoleMenuElements() {
  return document.querySelectorAll(
    ".nav-all,.nav-admin,.nav-worker,.nav-driver,.nav-recycling"
  );
}

function hideAllMenus() {
  getRoleMenuElements().forEach((el) => {
    el.classList.add("role-hidden");
  });
}

function showMenus(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    el.classList.remove("role-hidden");
  });
}

function applyRoleMenu(roleArg = null) {
  const role = normalizeRole(roleArg || getStoredRole());

  hideAllMenus();
  showMenus(".nav-all");

  if (!role) return;

  if (role === "admin") {
    showMenus(".nav-admin");
    return;
  }

  if (role === "worker") {
    showMenus(".nav-worker");
    return;
  }

  if (role === "driver") {
    showMenus(".nav-driver");
    return;
  }

  if (role === "recycling_manager") {
    showMenus(".nav-recycling");
  }
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

function hideSidebarUntilReady() {
  document.querySelectorAll(".sidebar").forEach((el) => {
    el.style.visibility = "hidden";
  });
}

function showSidebarWhenReady() {
  document.querySelectorAll(".sidebar").forEach((el) => {
    el.style.visibility = "visible";
  });
}

async function protectPage(allowedRoles = null, opts = {}) {
  const { silent = false } = opts || {};
  const page = getCurrentPageName();

  if (isPublicAuthPage()) {
    const token =
      localStorage.getItem("token") || sessionStorage.getItem("token");
    return !!token;
  }

  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  if (!token) {
    if (!silent) window.location.replace("index.html");
    return false;
  }

  let me;
  try {
    me = await apiGet("/api/me");
  } catch {
    if (!silent) window.location.replace("index.html");
    return false;
  }

  if (!me?.ok) {
    const storedRole = getStoredRole();

    if (!storedRole) {
      if (!silent) window.location.replace("index.html");
      return false;
    }

    const fallbackPages = ROLE_ACCESS[storedRole] || [];
    if (fallbackPages.length > 0 && !fallbackPages.includes(page)) {
      if (!silent) window.location.replace("dashboard.html");
      return false;
    }

    return storedRole;
  }

  const role = normalizeRole(
    me?.data?.role ||
      me?.data?.user?.role ||
      localStorage.getItem("role") ||
      sessionStorage.getItem("role")
  );

  if (role) {
    localStorage.setItem("role", role);
    sessionStorage.setItem("role", role);
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    const normalizedAllowed = allowedRoles.map(normalizeRole);
    if (!normalizedAllowed.includes(role)) {
      if (!silent) window.location.replace("dashboard.html");
      return false;
    }
    return role;
  }

  const allowedPages = ROLE_ACCESS[role] || [];
  if (allowedPages.length > 0 && !allowedPages.includes(page)) {
    if (!silent) window.location.replace("dashboard.html");
    return false;
  }

  return role || true;
}

function logout() {
  clearSessionStorage();
  window.location.replace("index.html");
}

if (!isPublicAuthPage()) {
  hideSidebarUntilReady();
}

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

  if (page === "index.html" || page === "register.html" || page === "") {
    return;
  }

  hideSidebarUntilReady();
  hideAllMenus();

  let role = null;

  try {
    const result = await protectPage();

    if (!result) return;

    role = typeof result === "string" ? result : getStoredRole();

    applyRoleMenu(role);
    initProfileMenu();
    setActiveNav();

    document.getElementById("logoutBtnTop")?.addEventListener("click", logout);
    document
      .getElementById("logoutBtnSidebar")
      ?.addEventListener("click", logout);

    showSidebarWhenReady();
  } catch {
    return;
  }
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