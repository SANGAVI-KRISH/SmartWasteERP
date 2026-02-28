// app.js (FULL UPDATED v3.3 - Trip: Assigned → Started → Completed + Staff & Vehicle Activity Logs visible)
// ✅ Fixes / Adds in v3.3
// 1) Staff & Vehicle page now renders logs even if tbody id is different (tripsBody / activityBody / activityTbody)
// 2) Trip list shows Staff Name (not only UUID) by mapping profiles
// 3) Optional delete trip log button support (if you add a delete button column in HTML)
// 4) Keeps your existing Trip -> Collection redirect flow + all previous modules

import { API_URL as RAW_API_URL } from "./config.js";
import { supabase } from "./supabaseClient.js";

/* =========================
   CONFIG TOGGLES (EDIT IF NEEDED)
========================= */
// If your complaints table DOES NOT have created_by column, set false.
const HAS_COMPLAINT_CREATED_BY = true;

// If your collection_records table DOES NOT have task_id/bin_id columns, set false.
const COLLECTION_HAS_TASK_AND_BIN = true;

// ✅ If your collection_records table has staff_task_id column, set true (recommended)
const COLLECTION_HAS_STAFF_TASK_ID = true;

// ✅ If your staff_tasks table has started_at/completed_at columns, set true (recommended)
const STAFF_TASK_HAS_TIMESTAMPS = true;

// When collection record exists, do you want to force kg entry in prompt? (optional)
const REQUIRE_COLLECTED_KG_PROMPT = true;

/* ✅ expose supabase globally */
window.supabase = supabase;

/* =========================
   Small Helpers
========================= */
function $(id) {
  return document.getElementById(id);
}

window.toast = function (msg) {
  const t = $("toast");
  if (!t) {
    alert(msg);
    return;
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => (t.style.display = "none"), 1700);
};

// Normalize API URL (remove trailing slash)
const API_URL = (RAW_API_URL || "").replace(/\/+$/, "");

/* =========================
   API Helper (prevents JSON crash)
========================= */
async function apiFetch(path, options = {}) {
  const url = API_URL + path;

  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      raw: "",
      error: "Network error: cannot reach backend (URL/DNS/blocked)",
      url
    };
  }

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const backendMsg = data?.error || data?.message || data?.supabase_error;
    let msg = backendMsg || `Request failed (${res.status})`;
    if (res.status === 404) msg = `404 Not Found: Wrong API_URL or wrong route: ${path}`;
    return { ok: false, status: res.status, data, raw, error: msg, url };
  }

  return { ok: true, status: res.status, data, raw, error: null, url };
}

/* =========================
   ROLE NORMALIZATION ✅
========================= */
function normalizeRole(roleRaw) {
  const r = (roleRaw || "").trim().toLowerCase();

  if (r === "recycling manager" || r === "recycling-manager" || r === "recycling_manager")
    return "recycling_manager";
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

/* =========================
   ACCESS RULES ✅
========================= */
const ROLE_ACCESS = {
  admin: [
    "dashboard.html", "users.html", "tasks.html", "collection.html", "bins.html",
    "recycling.html", "staff_vehicle.html", "report.html", "map.html", "profile.html",
    "complaints.html"
  ],
  recycling_manager: [
    "dashboard.html", "tasks.html", "recycling.html", "report.html", "map.html", "profile.html"
  ],
  worker: [
    "dashboard.html", "tasks.html", "collection.html", "bins.html",
    "staff_vehicle.html", "report.html", "map.html", "profile.html",
    "complaints.html"
  ],
  driver: [
    "dashboard.html", "tasks.html", "collection.html", "bins.html",
    "staff_vehicle.html", "report.html", "map.html", "profile.html",
    "complaints.html"
  ]
};

/* =========================
   CURRENT PAGE NAME
========================= */
function getCurrentPageName() {
  const p = (window.location.pathname || "").split("/").pop() || "";
  return p || "dashboard.html";
}

function isPublicAuthPage() {
  const p = getCurrentPageName();
  return p === "" || p === "index.html" || p === "register.html";
}

function clearSessionStorage() {
  ["user_id", "token", "role", "area", "full_name"].forEach(k => localStorage.removeItem(k));
}

/* =========================
   SIDEBAR ACTIVE ✅
========================= */
function setActiveNav() {
  const current = getCurrentPageName();

  document.querySelectorAll(".sidebar .nav a.active")
    .forEach(el => el.classList.remove("active"));

  const links = Array.from(document.querySelectorAll(".sidebar .nav a[href]"));
  const match = links.find(a => {
    const href = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    return href === current;
  });

  if (match) match.classList.add("active");
}
window.setActiveNav = setActiveNav;

/* =========================
   AUTH (Supabase Auth + Profile)
========================= */
async function signUp() {
  const full_name = (($("full_name")?.value || $("fullname")?.value || $("name")?.value) || "").trim();
  const roleRaw = $("role")?.value;
  const area = ($("area")?.value || $("place")?.value || "").trim();
  const email = ($("email")?.value || "").trim().toLowerCase();
  const password = $("password")?.value || "";
  const confirm = $("confirmPassword")?.value || "";
  const msg = $("msg");

  const role = normalizeRole(roleRaw);

  if (!full_name || !role || !area || !email || !password) {
    if (msg) msg.textContent = "Fill all fields";
    return;
  }
  if (password !== confirm) {
    if (msg) msg.textContent = "Passwords do not match";
    return;
  }

  if (msg) msg.textContent = "Creating account...";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, area, full_name } }
  });

  if (error || !data?.user) {
    if (msg) msg.textContent = error?.message || "Signup failed";
    console.log("SUPABASE SIGNUP error:", error);
    return;
  }

  const userId = data.user.id;

  // Optional backend route (non-blocking)
  if (API_URL) {
    const r = await apiFetch("/api/create-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, email, role, area, full_name })
    });
    if (!r.ok) console.log("CREATE-PROFILE (non-blocking):", r);
  }

  if (msg) msg.textContent = "Account created ✅ Now login";
  setTimeout(() => (window.location = "index.html"), 900);
}
window.signUp = signUp;

async function signIn() {
  const email = ($("email")?.value || "").trim().toLowerCase();
  const password = $("password")?.value || "";
  const msg = $("msg");

  if (!email || !password) {
    if (msg) msg.textContent = "Enter email and password";
    return;
  }

  if (msg) msg.textContent = "Signing in...";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    if (msg) msg.textContent = error?.message || "Login failed";
    console.log("SUPABASE LOGIN error:", error);
    return;
  }

  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData?.session;
  if (!session) {
    if (msg) msg.textContent = "Login session not ready. Try again.";
    return;
  }

  const user = session.user;
  localStorage.setItem("user_id", user.id);
  localStorage.setItem("token", session.access_token || "");

  const { data: p, error: perr } = await supabase
    .from("profiles")
    .select("role, area, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (perr) {
    console.log("PROFILE SELECT error:", perr);
    if (msg) msg.textContent = `Profile fetch failed: ${perr.message}`;
    return;
  }

  if (!p) {
    if (msg) msg.textContent = "Profile missing. Signup again.";
    return;
  }

  const fixedRole = normalizeRole(p.role);
  localStorage.setItem("role", fixedRole);
  localStorage.setItem("area", (p.area || "").trim());
  localStorage.setItem("full_name", (p.full_name || "").trim());

  window.location = "dashboard.html";
}
window.signIn = signIn;

async function logout() {
  try { await supabase.auth.signOut(); } catch {}
  clearSessionStorage();
  window.location = "index.html";
}
window.logout = logout;

window.getSessionUser = async function () {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};

/* =========================
   ✅ SYNC ROLE FROM DB (fixes admin showing worker)
========================= */
async function syncProfileToStorage() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;

  const userId = session.user.id;
  localStorage.setItem("user_id", userId);
  localStorage.setItem("token", session.access_token || "");

  const { data: p, error } = await supabase
    .from("profiles")
    .select("role, area, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !p) return null;

  const fixedRole = normalizeRole(p.role);
  localStorage.setItem("role", fixedRole);
  localStorage.setItem("area", (p.area || "").trim());
  localStorage.setItem("full_name", (p.full_name || "").trim());

  return { role: fixedRole, profile: p };
}

/* =========================
   PAGE PROTECTION ✅
========================= */
async function protectPage(allowedRoles = null, opts = {}) {
  const { silent = false } = opts || {};
  const page = getCurrentPageName();

  // ✅ Never auto-redirect public auth pages
  if (isPublicAuthPage()) {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  }

  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  if (!session) {
    clearSessionStorage();
    if (!silent) window.location.replace("index.html");
    return false;
  }

  // Always sync profile to prevent stale role issues
  const synced = await syncProfileToStorage();
  const role = synced?.role || getStoredRole();

  // If a page wants to restrict by roles explicitly
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(role)) {
      if (!silent) window.location.replace("dashboard.html");
      return false;
    }
    return true;
  }

  // Otherwise enforce allowed pages by ROLE_ACCESS
  const allowedPages = ROLE_ACCESS[role] || [];
  if (allowedPages.length && !allowedPages.includes(page)) {
    if (!silent) window.location.replace("dashboard.html");
    return false;
  }

  return true;
}
window.protectPage = protectPage;

/* =========================
   ROLE BASED MENU ✅
========================= */
function applyRoleMenu() {
  const role = getStoredRole();

  document.querySelectorAll(".nav-admin,.nav-worker,.nav-driver,.nav-recycling")
    .forEach(el => (el.style.display = "none"));

  document.querySelectorAll(".nav-all")
    .forEach(el => (el.style.display = "block"));

  if (!role) return;

  if (role === "admin") {
    document.querySelectorAll(".nav-admin,.nav-worker,.nav-driver,.nav-recycling")
      .forEach(el => (el.style.display = "block"));
    return;
  }

  const cls =
    role === "recycling_manager" ? "nav-recycling" :
    role === "worker" ? "nav-worker" :
    role === "driver" ? "nav-driver" :
    ("nav-" + role);

  document.querySelectorAll("." + cls).forEach(el => (el.style.display = "block"));
}
window.applyRoleMenu = applyRoleMenu;

/* =========================
   PROFILE DROPDOWN
========================= */
function initProfileMenu() {
  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileDropdown");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
  });

  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => (menu.style.display = "none"));
}
window.initProfileMenu = initProfileMenu;

/* =========================
   PROFILE PAGE LOAD
========================= */
async function loadProfile() {
  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData?.session;
  if (!session) { clearSessionStorage(); window.location = "index.html"; return; }

  const userId = session.user.id;
  localStorage.setItem("user_id", userId);
  localStorage.setItem("token", session.access_token || "");

  const userEmail = session.user?.email || "";
  if ($("profileEmail")) $("profileEmail").value = userEmail;

  const { data: p, error } = await supabase
    .from("profiles")
    .select("role, area, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) { toast("Profile load failed: " + error.message); return; }
  if (!p) { toast("Profile row not found. Signup again."); return; }

  if ($("profileRole")) $("profileRole").value = normalizeRole(p.role) || "-";
  if ($("profileArea")) $("profileArea").value = (p.area || "-");
  if ($("profileName")) $("profileName").value = (p.full_name || "-");

  localStorage.setItem("role", normalizeRole(p.role || ""));
  localStorage.setItem("area", (p.area || "").trim());
  localStorage.setItem("full_name", (p.full_name || "").trim());
}
window.loadProfile = loadProfile;

async function changePassword() {
  const np = $("newPassword")?.value || "";
  const msg = $("msg");

  if (np.length < 6) {
    if (msg) msg.textContent = "Password must be at least 6 characters";
    toast("Password must be at least 6 characters");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: np });

  if (error) {
    if (msg) msg.textContent = error.message;
    toast(error.message);
  } else {
    if (msg) msg.textContent = "";
    toast("Password updated ✅");
    if ($("newPassword")) $("newPassword").value = "";
  }
}
window.changePassword = changePassword;

/* =========================
   CORE ERP: BINS → PICKUP TASKS
========================= */
async function getMyProfileFromStorage() {
  return {
    id: localStorage.getItem("user_id"),
    role: getStoredRole(),
    area: localStorage.getItem("area"),
  };
}

async function createPickupTaskIfNeeded(binId, area) {
  const { data: existing } = await supabase
    .from("pickup_tasks")
    .select("id")
    .eq("bin_id", binId)
    .eq("status", "OPEN")
    .limit(1);

  if (existing?.length) return;

  const { data: workers } = await supabase
    .from("profiles").select("id")
    .eq("role", "worker").eq("area", area).limit(1);

  const { data: drivers } = await supabase
    .from("profiles").select("id")
    .eq("role", "driver").eq("area", area).limit(1);

  const { error } = await supabase.from("pickup_tasks").insert([{
    bin_id: binId,
    area,
    assigned_worker_id: workers?.[0]?.id || null,
    assigned_driver_id: drivers?.[0]?.id || null,
    status: "OPEN"
  }]);

  if (error) throw new Error(error.message);
}

async function saveBin() {
  try {
    const binId = ($("binid")?.value || "").trim();
    const area = ($("binarea")?.value || "").trim();
    const status = $("status")?.value;

    if (!binId || !area) { toast("Enter Bin ID and Area"); return; }

    const me = await getMyProfileFromStorage();

    const { data: found } = await supabase
      .from("bins")
      .select("id")
      .eq("bin_id", binId)
      .limit(1);

    if (found?.length) {
      const { error } = await supabase
        .from("bins")
        .update({ area, status, updated_by: me.id, updated_at: new Date().toISOString() })
        .eq("id", found[0].id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("bins")
        .insert([{ bin_id: binId, area, status, updated_by: me.id }]);
      if (error) throw new Error(error.message);
    }

    if (status === "Full") {
      await createPickupTaskIfNeeded(binId, area);
      toast("Bin FULL → Task created ✅");
    } else {
      toast("Bin updated ✅");
    }

    window.renderBins?.();
  } catch (e) {
    toast("Error: " + e.message);
  }
}
window.saveBin = saveBin;

async function renderBins() {
  const tbody = $("binsBody");
  if (!tbody) return;

  const q = ($("searchBins")?.value || "").toLowerCase();

  const { data, error } = await supabase
    .from("bins")
    .select("bin_id, area, status, updated_at")
    .order("updated_at", { ascending: false });

  if (error) { tbody.innerHTML = ""; toast(error.message); return; }

  const pill = (s) => s === "Full" ? "bad" : (s === "Half" ? "warn" : "good");

  const list = (data || []).filter(x =>
    (x.bin_id || "").toLowerCase().includes(q) ||
    (x.area || "").toLowerCase().includes(q) ||
    (x.status || "").toLowerCase().includes(q)
  );

  tbody.innerHTML = list.map(x => `
    <tr>
      <td>${x.bin_id}</td>
      <td>${x.area}</td>
      <td><span class="pill ${pill(x.status)}">${x.status}</span></td>
      <td>${x.updated_at ? new Date(x.updated_at).toLocaleString() : ""}</td>
    </tr>
  `).join("");
}
window.renderBins = renderBins;

/* =========================
   ✅ STAFF TASKS (Trip logs → appear in My Tasks)
========================= */
async function findUserIdByNameOrEmail(text) {
  const key = (text || "").trim();
  if (!key) return null;

  if (key.includes("@")) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", key)
      .maybeSingle();
    return data?.id || null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .ilike("full_name", key)
    .maybeSingle();

  return data?.id || null;
}

async function saveTrip() {
  try {
    const { data: sessData } = await supabase.auth.getSession();
    const session = sessData?.session;
    if (!session) { toast("Login required"); window.location = "index.html"; return; }

    const date = document.getElementById("vdate")?.value;
    const vehicle_id = (document.getElementById("vehicleId")?.value || "").trim();
    const staff_name = (document.getElementById("staffName")?.value || "").trim();
    const route = (document.getElementById("route")?.value || "").trim();
    const shift = document.getElementById("shift")?.value;
    const status = document.getElementById("tripStatus")?.value || "Assigned";

    if (!date || !vehicle_id || !staff_name || !route || !shift) {
      toast("Fill all fields");
      return;
    }

    const assigned_to = await findUserIdByNameOrEmail(staff_name);
    if (!assigned_to) {
      toast("Staff not found. Enter exact Full Name or Email (must exist in Users).");
      return;
    }

    const payload = {
      assigned_to,
      task_type: "TRIP",
      date,
      vehicle_id,
      route,
      shift,
      status,
      created_by: session.user.id
    };

    // reset timestamps if admin assigns "Assigned"
    if (STAFF_TASK_HAS_TIMESTAMPS && status === "Assigned") {
      payload.started_at = null;
      payload.completed_at = null;
    }

    const { error } = await supabase.from("staff_tasks").insert([payload]);

    if (error) {
      console.log("staff_tasks insert error:", error);
      toast("Save failed: " + error.message);
      return;
    }

    toast("Trip Assigned ✅ (will appear in Activity Logs + staff My Tasks)");
    await window.renderTrips?.();
  } catch (e) {
    console.log(e);
    toast("Save error: " + (e?.message || e));
  }
}
window.saveTrip = saveTrip;

/* ✅ Helper: get the correct tbody id on Staff & Vehicle page */
function getTripTbody() {
  // Your HTML might use any of these ids. We support all.
  return (
    document.getElementById("tripsBody") ||
    document.getElementById("activityBody") ||
    document.getElementById("activityTbody") ||
    document.querySelector("#activityLogs tbody") ||
    null
  );
}

/* ✅ renderTrips now shows staff name by mapping profiles */
async function renderTrips() {
  const tbody = getTripTbody();
  if (!tbody) return;

  const q = (document.getElementById("searchTrips")?.value || "").toLowerCase().trim();

  const selectCols = STAFF_TASK_HAS_TIMESTAMPS
    ? "id,date,vehicle_id,route,shift,status,created_at,assigned_to,started_at,completed_at"
    : "id,date,vehicle_id,route,shift,status,created_at,assigned_to";

  const { data, error } = await supabase
    .from("staff_tasks")
    .select(selectCols)
    .eq("task_type", "TRIP")
    .order("created_at", { ascending: false });

  if (error) { console.log(error); toast("Fetch failed: " + error.message); return; }

  const rows = (data || []);

  // ✅ Map assigned_to -> full_name
  const ids = [...new Set(rows.map(r => r.assigned_to).filter(Boolean))];
  let nameMap = {};
  if (ids.length) {
    const { data: profs, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);

    if (!pErr && profs) {
      profs.forEach(p => {
        nameMap[p.id] = p.full_name || p.email || p.id;
      });
    }
  }

  const filtered = rows.filter(r => {
    const staffLabel = nameMap[r.assigned_to] || r.assigned_to || "";
    const s = `${r.date} ${r.vehicle_id} ${staffLabel} ${r.route} ${r.shift} ${r.status}`.toLowerCase();
    return !q || s.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8">No logs found.</td></tr>`;
    return;
  }

  // ✅ Build HTML: match your screenshot columns:
  // DATE | VEHICLE | STAFF | ROUTE | SHIFT | STATUS | TASK ID | ACTIONS
  tbody.innerHTML = filtered.map(r => {
    const staffLabel = nameMap[r.assigned_to] || (r.assigned_to ? (r.assigned_to.slice(0, 6) + "…") : "-");
    return `
      <tr>
        <td>${r.date || ""}</td>
        <td>${r.vehicle_id || ""}</td>
        <td>${staffLabel}</td>
        <td>${r.route || ""}</td>
        <td>${r.shift || ""}</td>
        <td>${r.status || ""}</td>
        <td>${r.id || ""}</td>
        <td>
          <button class="btn red" onclick="deleteTripLog('${r.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}
window.renderTrips = renderTrips;

/* ✅ Optional delete for trip logs (Activity Logs) */
async function deleteTripLog(id) {
  const role = getStoredRole();
  if (role !== "admin") {
    toast("Only admin can delete logs");
    return;
  }

  const { error } = await supabase
    .from("staff_tasks")
    .delete()
    .eq("id", id);

  if (error) {
    console.log(error);
    toast("Delete failed: " + error.message);
    return;
  }

  toast("Deleted ✅");
  await window.renderTrips?.();
}
window.deleteTripLog = deleteTripLog;

/* ✅ Trip status update:
   Assigned -> Started sets started_at
   Started  -> Completed sets completed_at and redirects to Collection (with staff_task_id)
*/
async function updateStaffTaskStatus(taskId, newStatus) {
  const payload = { status: newStatus };

  if (STAFF_TASK_HAS_TIMESTAMPS) {
    if (newStatus === "Started") payload.started_at = new Date().toISOString();
    if (newStatus === "Completed") payload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("staff_tasks")
    .update(payload)
    .eq("id", taskId);

  if (error) { toast("Update failed: " + error.message); return; }

  toast("Updated ✅");
  await window.renderTasks?.();
  await window.renderTrips?.();

  // ✅ When completed, push user to Collection and pass task id
  if (newStatus === "Completed") {
    setTimeout(() => {
      window.location = `collection.html?staff_task_id=${encodeURIComponent(taskId)}`;
    }, 500);
  }
}
window.updateStaffTaskStatus = updateStaffTaskStatus;

/* =========================
   ✅ MANDATORY CHECK HELPERS
========================= */
async function hasCollectionForTask(taskId) {
  if (!taskId) return false;
  const { data, error } = await supabase
    .from("collection_records")
    .select("id")
    .eq("task_id", taskId)
    .limit(1);

  if (error) {
    console.log("collection_records check error:", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
window.hasCollectionForTask = hasCollectionForTask;

/* =========================
   MY TASKS (Pickup + Trip)
========================= */
function getTaskFiltersFromDOM() {
  const q = (($("searchTasks")?.value || $("searchMyTasks")?.value || "") + "").toLowerCase().trim();
  const status = ($("filterStatus")?.value || $("taskStatusFilter")?.value || "").trim();
  const priority = ($("filterPriority")?.value || "").trim();
  return { q, status, priority };
}

function statusMatchesFilter(taskStatus, filterStatus) {
  if (!filterStatus) return true;

  const s = String(taskStatus || "").trim().toLowerCase();
  const f = String(filterStatus || "").trim().toLowerCase();

  if (s === f) return true;

  const map = {
    pending: ["open", "assigned"],
    assigned: ["assigned", "open"],
    in_progress: ["started", "in progress"],
    collected: ["collected"],
    delivered: ["delivered"],
    received: ["received"],
    recycled: ["recycled"],
    completed: ["completed", "done"]
  };

  const allowed = map[f];
  if (!allowed) return false;
  return allowed.includes(s);
}

async function loadMyTasks() {
  const tbody = $("tasksBody");
  if (!tbody) return [];

  const role = getStoredRole();
  const userId = localStorage.getItem("user_id");

  // Pickup tasks
  let pickupQuery = supabase
    .from("pickup_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (role === "worker" || role === "driver") {
    pickupQuery = pickupQuery.or(`assigned_worker_id.eq.${userId},assigned_driver_id.eq.${userId}`);
  }

  const { data: pickup, error: pErr } = await pickupQuery;
  if (pErr) { toast(pErr.message); return []; }

  // Trip tasks
  let staffQuery = supabase
    .from("staff_tasks")
    .select("id,task_type,date,vehicle_id,route,shift,status,created_at,assigned_to,started_at,completed_at")
    .order("created_at", { ascending: false });

  if (role !== "admin") staffQuery = staffQuery.eq("assigned_to", userId);

  const { data: staffTasks, error: sErr } = await staffQuery;
  if (sErr) console.log("staff_tasks fetch:", sErr);

  const pickupRows = (pickup || []).map(t => ({
    kind: "PICKUP",
    id: t.id,
    created_at: t.created_at || null,
    priority: t.priority || "High",
    col1: `Bin: ${t.bin_id}`,
    col2: `Area: ${t.area}`,
    assigned: [
      t.assigned_worker_id ? `W:${t.assigned_worker_id.slice(0, 6)}…` : "",
      t.assigned_driver_id ? `D:${t.assigned_driver_id.slice(0, 6)}…` : ""
    ].filter(Boolean).join(" "),
    status: t.status,
    action: pickupActionButton(t, role)
  }));

  const tripRows = (staffTasks || [])
    .filter(t => t.task_type === "TRIP")
    .map(t => ({
      kind: "TRIP",
      id: t.id,
      created_at: t.created_at || null,
      priority: t.priority || "Medium",
      col1: `Trip: ${t.vehicle_id}`,
      col2: `${t.route} | ${t.shift} | ${t.date}`,
      assigned: t.assigned_to ? `${t.assigned_to.slice(0, 6)}…` : "-",
      status: t.status,
      action: tripActionButton(t, role)
    }));

  return [...tripRows, ...pickupRows];
}
window.loadMyTasks = loadMyTasks;

async function renderTasks() {
  const tbody = $("tasksBody");
  if (!tbody) return;

  const all = await loadMyTasks();
  const { q, status, priority } = getTaskFiltersFromDOM();

  let filtered = (all || []);

  if (q) {
    filtered = filtered.filter(x => {
      const blob = `${x.kind} ${x.col1} ${x.col2} ${x.assigned} ${x.status} ${x.priority}`.toLowerCase();
      return blob.includes(q);
    });
  }

  if (status) filtered = filtered.filter(x => statusMatchesFilter(x.status, status));
  if (priority) filtered = filtered.filter(x => String(x.priority || "").toLowerCase() === String(priority).toLowerCase());

  window.__tasksCount = filtered.length;

  const thCount = document.querySelectorAll("table.table thead th").length;

  if (thCount >= 7) {
    tbody.innerHTML = filtered.map(x => `
      <tr>
        <td>${x.created_at ? new Date(x.created_at).toLocaleString() : ""}</td>
        <td>${x.kind}</td>
        <td>${x.col1} <div class="sub" style="margin:0;">${x.col2}</div></td>
        <td>${x.assigned || "-"}</td>
        <td>${x.priority || "-"}</td>
        <td>${x.status || ""}</td>
        <td>${x.action}</td>
      </tr>
    `).join("");
  } else {
    tbody.innerHTML = filtered.map(x => `
      <tr>
        <td>${x.col1}</td>
        <td>${x.col2}</td>
        <td>${x.status}</td>
        <td>${x.action}</td>
      </tr>
    `).join("");
  }
}
window.renderTasks = renderTasks;

function tripActionButton(t, role) {
  if (role !== "admin") {
    if (t.status === "Assigned") {
      return `<button class="btn" onclick="updateStaffTaskStatus('${t.id}','Started')">Mark Started</button>`;
    }
    if (t.status === "Started") {
      return `<button class="btn" onclick="updateStaffTaskStatus('${t.id}','Completed')">Mark Completed</button>`;
    }
    return "✅ Done";
  }
  return "-";
}

function pickupActionButton(t, role) {
  if (role === "worker" && t.status === "OPEN")
    return `<button class="btn" onclick="markCollected('${t.id}')">Mark Collected</button>`;

  if (role === "driver" && t.status === "COLLECTED")
    return `<button class="btn" onclick="markDelivered('${t.id}')">Mark Delivered</button>`;

  if (role === "recycling_manager" && t.status === "DELIVERED")
    return `<button class="btn" onclick="markReceived('${t.id}')">Mark Received</button>`;

  if (role === "recycling_manager" && t.status === "RECEIVED")
    return `<button class="btn" onclick="markRecycled('${t.id}')">Mark Recycled</button>`;

  return "-";
}

/* ✅ Mandatory enforcement (frontend) */
async function markCollected(taskId) {
  const ok = await hasCollectionForTask(taskId);
  if (!ok) {
    toast("❌ Collection entry is mandatory. Please save in Collection page first.");
    setTimeout(() => { window.location = "collection.html"; }, 700);
    return;
  }

  let kg = null;
  if (REQUIRE_COLLECTED_KG_PROMPT) {
    const kgRaw = prompt("Collected kg? (Enter same kg as collection entry)");
    if (kgRaw === null) return;
    kg = Number(kgRaw);
    if (Number.isNaN(kg) || kg <= 0) { toast("Enter valid collected kg"); return; }
  }

  const payload = {
    status: "COLLECTED",
    collected_at: new Date().toISOString()
  };
  if (kg !== null) payload.collected_kg = kg;

  const { error } = await supabase
    .from("pickup_tasks")
    .update(payload)
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Collected ✅");

  window.renderTasks?.();
}
window.markCollected = markCollected;

async function markDelivered(taskId) {
  const { error } = await supabase
    .from("pickup_tasks")
    .update({ status: "DELIVERED", delivered_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Delivered ✅");

  window.renderTasks?.();
}
window.markDelivered = markDelivered;

async function markReceived(taskId) {
  const receivedRaw = prompt("Received kg?");
  if (receivedRaw === null) return;
  const received = Number(receivedRaw);
  if (Number.isNaN(received) || received <= 0) { toast("Enter valid received kg"); return; }

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "RECEIVED",
      received_kg: received,
      received_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Received ✅");

  window.renderTasks?.();
}
window.markReceived = markReceived;

async function markRecycled(taskId) {
  const recycledRaw = prompt("Recycled kg?");
  if (recycledRaw === null) return;
  const recycled = Number(recycledRaw);
  if (Number.isNaN(recycled) || recycled < 0) { toast("Enter valid recycled kg"); return; }

  const percentRaw = prompt("Recycle %?");
  if (percentRaw === null) return;
  const percent = Number(percentRaw);
  if (Number.isNaN(percent) || percent < 0 || percent > 100) { toast("Enter valid % (0-100)"); return; }

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "RECYCLED",
      recycled_kg: recycled,
      recycle_percent: percent,
      recycled_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Recycled ✅");

  window.renderTasks?.();
}
window.markRecycled = markRecycled;

/* =========================
   USERS (Admin)
========================= */
let _usersCache = [];

async function loadUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, area, full_name, created_at")
    .order("created_at", { ascending: false });

  if (error) { toast("Load users failed: " + error.message); return; }

  _usersCache = data || [];
  window.renderUsers?.();
}
window.loadUsers = loadUsers;

function renderUsers() {
  const tbody = $("usersBody");
  if (!tbody) return;

  const q = ($("searchUsers")?.value || "").toLowerCase();

  const list = (_usersCache || []).filter(u =>
    (u.full_name || "").toLowerCase().includes(q) ||
    (u.email || "").toLowerCase().includes(q) ||
    (u.role || "").toLowerCase().includes(q) ||
    (u.area || "").toLowerCase().includes(q)
  );

  tbody.innerHTML = list.map(u => {
    const role = normalizeRole(u.role);
    return `
      <tr>
        <td>${u.email || ""}</td>
        <td>
          <select id="role_${u.id}">
            ${["admin", "worker", "driver", "recycling_manager"].map(r =>
              `<option value="${r}" ${role === r ? "selected" : ""}>${r}</option>`
            ).join("")}
          </select>
        </td>
        <td><input id="area_${u.id}" value="${u.area || ""}" /></td>
        <td><button type="button" class="btn" onclick="updateUser('${u.id}')">Save</button></td>
      </tr>
    `;
  }).join("");
}
window.renderUsers = renderUsers;

async function updateUser(userId) {
  const role = normalizeRole($("role_" + userId)?.value);
  const area = ($("area_" + userId)?.value || "").trim();

  if (!area) { toast("Area required"); return; }

  const { error } = await supabase
    .from("profiles")
    .update({ role, area })
    .eq("id", userId);

  if (error) { toast("Update failed: " + error.message); return; }

  toast("User updated ✅");
  window.loadUsers?.();
}
window.updateUser = updateUser;

/* =========================
   COLLECTION MODULE
========================= */
async function saveCollection() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    toast("Login required");
    window.location = "index.html";
    return;
  }

  const date = $("date")?.value;
  const area = ($("area")?.value || "").trim();
  const type = $("type")?.value;
  const qtyRaw = $("qty")?.value;
  const qty = Number(qtyRaw);

  const taskId = (($("taskId")?.value || "").trim() || null);
  const binId = (($("binId")?.value || "").trim() || null);

  // ✅ get staff_task_id from URL (when coming from Trip completion)
  const staffTaskIdFromUrl = new URLSearchParams(window.location.search).get("staff_task_id");
  const staff_task_id = (staffTaskIdFromUrl || "").trim() || null;

  if (!date || !area || !type || !qtyRaw || Number.isNaN(qty) || qty <= 0) {
    toast("Fill all fields (Qty must be > 0)");
    return;
  }

  const payload = {
    user_id: session.user.id,
    date,
    area,
    waste_type: type,
    quantity_kg: qty
  };

  if (COLLECTION_HAS_TASK_AND_BIN) {
    payload.task_id = taskId;
    payload.bin_id = binId;
  }

  if (COLLECTION_HAS_STAFF_TASK_ID) {
    payload.staff_task_id = staff_task_id; // can be null
  }

  const { error } = await supabase
    .from("collection_records")
    .insert([payload]);

  if (error) {
    console.log(error);
    toast("Save failed: " + error.message);
    return;
  }

  if ($("area")) $("area").value = "";
  if ($("qty")) $("qty").value = "";
  if ($("binId")) $("binId").value = "";
  if ($("taskId")) $("taskId").value = "";

  toast("Collection Saved ✅");
  await window.renderCollections?.();
}
window.saveCollection = saveCollection;

async function renderCollections() {
  const tbody = $("collectionsBody");
  if (!tbody) return;

  const q = ($("searchCollections")?.value || "").toLowerCase().trim();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // ✅ build select columns based on toggles
  let cols = "id,date,area,waste_type,quantity_kg,created_at";
  if (COLLECTION_HAS_TASK_AND_BIN) cols += ",task_id,bin_id";
  if (COLLECTION_HAS_STAFF_TASK_ID) cols += ",staff_task_id";

  const { data, error } = await supabase
    .from("collection_records")
    .select(cols)
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.log(error);
    toast("Fetch failed: " + error.message);
    return;
  }

  const list = (data || []).filter(r => {
    const d = String(r.date || "").toLowerCase();
    const a = String(r.area || "").toLowerCase();
    const t = String(r.waste_type || "").toLowerCase();
    const tid = String(r.task_id || "").toLowerCase();
    const bid = String(r.bin_id || "").toLowerCase();
    const stid = String(r.staff_task_id || "").toLowerCase();
    return !q || d.includes(q) || a.includes(q) || t.includes(q) || tid.includes(q) || bid.includes(q) || stid.includes(q);
  });

  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.date || ""}</td>
      <td>${r.area || ""}</td>
      <td>${r.waste_type || ""}</td>
      <td>${r.quantity_kg ?? ""}</td>
      <td>
        <button class="btn red" onclick="deleteCollection('${r.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}
window.renderCollections = renderCollections;

async function deleteCollection(id) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { error } = await supabase
    .from("collection_records")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    console.log(error);
    toast("Delete failed: " + error.message);
    return;
  }

  toast("Deleted ✅");
  await window.renderCollections?.();
}
window.deleteCollection = deleteCollection;

/* =========================
   RECYCLING MODULE
========================= */
async function saveRecycle() {
  try {
    const { data: sessData } = await supabase.auth.getSession();
    const session = sessData?.session;
    if (!session) {
      toast("Login required");
      window.location = "index.html";
      return;
    }

    const date = $("rdate")?.value;
    const waste_type = $("rtype")?.value;
    const input_kg = Number($("input")?.value);
    const recycled_kg = Number($("recycled")?.value);
    const landfill_kg = Number($("landfill")?.value);

    if (!date || !waste_type) { toast("Select date and waste type"); return; }
    if ([input_kg, recycled_kg, landfill_kg].some(n => Number.isNaN(n))) { toast("Enter valid numbers"); return; }
    if (input_kg < 0 || recycled_kg < 0 || landfill_kg < 0) { toast("Values cannot be negative"); return; }
    if (recycled_kg + landfill_kg > input_kg) { toast("Recycled + Landfill should not exceed Input"); return; }

    const { error } = await supabase.from("recycling").insert([{
      date,
      waste_type,
      input_kg,
      recycled_kg,
      landfill_kg
    }]);

    if (error) {
      console.log("recycling insert error:", error);
      toast("Save failed: " + error.message);
      return;
    }

    toast("Saved ✅");
    if ($("input")) $("input").value = "";
    if ($("recycled")) $("recycled").value = "";
    if ($("landfill")) $("landfill").value = "";
  } catch (e) {
    console.log(e);
    toast("Save error: " + (e?.message || e));
  }
}
window.saveRecycle = saveRecycle;

async function renderRecycling() {
  const tbody = $("recyclingBody");
  if (!tbody) return;

  const q = ($("searchRecycling")?.value || "").toLowerCase().trim();

  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData?.session;
  if (!session) return;

  const { data, error } = await supabase
    .from("recycling")
    .select("date, waste_type, input_kg, recycled_kg, landfill_kg, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.log("recycling select error:", error);
    toast("Fetch failed: " + error.message);
    tbody.innerHTML = "";
    return;
  }

  const filtered = (data || []).filter(r => {
    const d = String(r.date || "").toLowerCase();
    const t = String(r.waste_type || "").toLowerCase();
    return !q || d.includes(q) || t.includes(q);
  });

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.date || ""}</td>
      <td>${r.waste_type || ""}</td>
      <td>${r.input_kg ?? ""}</td>
      <td>${r.recycled_kg ?? ""}</td>
      <td>${r.landfill_kg ?? ""}</td>
    </tr>
  `).join("");
}
window.renderRecycling = renderRecycling;

/* =========================
   ✅ COMPLAINTS MODULE
========================= */
async function saveComplaint() {
  try {
    const { data: sessData } = await supabase.auth.getSession();
    const session = sessData?.session;
    if (!session) { toast("Login required"); window.location = "index.html"; return; }

    const citizen_name = ($("cname")?.value || "").trim();
    const area = ($("carea")?.value || "").trim();
    const issue = ($("cissue")?.value || "").trim();
    const priority = $("cpriority")?.value || "Low";

    if (!citizen_name || !area || !issue) {
      toast("Fill all fields");
      return;
    }

    const payload = {
      citizen_name,
      area,
      issue,
      priority,
      status: "Open"
    };

    if (HAS_COMPLAINT_CREATED_BY) payload.created_by = session.user.id;

    const { error } = await supabase.from("complaints").insert([payload]);

    if (error) {
      console.log("complaints insert error:", error);
      toast("Save failed: " + error.message);
      return;
    }

    toast("Complaint Submitted ✅");

    if ($("cname")) $("cname").value = "";
    if ($("carea")) $("carea").value = "";
    if ($("cissue")) $("cissue").value = "";
  } catch (e) {
    console.log(e);
    toast("Save error: " + (e?.message || e));
  }
}
window.saveComplaint = saveComplaint;

async function renderComplaints() {
  const tbody = $("complaintsBody");
  if (!tbody) return;

  const q = ($("searchComplaints")?.value || "").toLowerCase().trim();

  const { data, error } = await supabase
    .from("complaints")
    .select("id,citizen_name,area,issue,priority,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.log("complaints select error:", error);
    toast("Fetch failed: " + error.message);
    tbody.innerHTML = "";
    return;
  }

  const role = getStoredRole();

  const filtered = (data || []).filter(r => {
    const s = `${r.citizen_name} ${r.area} ${r.issue} ${r.priority} ${r.status}`.toLowerCase();
    return !q || s.includes(q);
  });

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
      <td>${r.citizen_name || ""}</td>
      <td>${r.area || ""}</td>
      <td>${r.issue || ""}</td>
      <td>${r.priority || ""}</td>
      <td>${r.status || ""}</td>
      <td>${role === "admin" ? complaintActions(r) : "-"}</td>
    </tr>
  `).join("");
}
window.renderComplaints = renderComplaints;

function complaintActions(r) {
  const next =
    r.status === "Open" ? "In Progress" :
    r.status === "In Progress" ? "Resolved" :
    null;

  if (!next) return "✅ Done";
  return `<button class="btn" onclick="updateComplaintStatus('${r.id}','${next}')">${next}</button>`;
}

async function updateComplaintStatus(id, status) {
  const { error } = await supabase
    .from("complaints")
    .update({ status })
    .eq("id", id);

  if (error) { toast("Update failed: " + error.message); return; }
  toast("Updated ✅");
  await window.renderComplaints?.();
}
window.updateComplaintStatus = updateComplaintStatus;

/* =========================
   DASHBOARD KPIs
========================= */
async function renderDashboard() {
  if (!window.location.pathname.includes("dashboard.html")) return;

  const elCollected = $("kpiCollected");
  const elFullBins = $("kpiFullBins");
  const elRecycled = $("kpiRecycled");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  let totalCollected = 0;
  {
    const { data, error } = await supabase.from("collection_records").select("quantity_kg");
    if (!error && data) totalCollected = data.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
  }

  let fullBins = 0;
  {
    const { data, error } = await supabase.from("bins").select("status");
    if (!error && data) fullBins = data.filter(b => (b.status || "").toLowerCase() === "full").length;
  }

  let totalRecycled = 0;
  {
    const { data, error } = await supabase.from("pickup_tasks").select("status, recycled_kg");
    if (!error && data) {
      totalRecycled = data
        .filter(t => t.status === "RECYCLED")
        .reduce((sum, t) => sum + (Number(t.recycled_kg) || 0), 0);
    }
  }

  if (elCollected) elCollected.textContent = `${totalCollected} kg`;
  if (elFullBins) elFullBins.textContent = `${fullBins}`;
  if (elRecycled) elRecycled.textContent = `${totalRecycled} kg`;
}
window.renderDashboard = renderDashboard;

/* =========================
   Auto load per page ✅
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  const page = getCurrentPageName();

  // Auth pages: no protection, no role menu, no nav highlight
  if (page === "index.html" || page === "register.html" || page === "") return;

  try { window.applyRoleMenu?.(); } catch {}
  try { await window.protectPage?.(); } catch {}
  try { window.initProfileMenu?.(); } catch {}
  try { window.setActiveNav?.(); } catch {}

  const path = window.location.pathname;

  if (path.includes("collection.html")) {
    window.renderCollections?.();
    $("saveCollectionBtn")?.addEventListener("click", async () => {
      try { await window.saveCollection(); }
      catch (e) { console.log(e); toast(e?.message || "Save error"); }
    });
    $("searchCollections")?.addEventListener("input", () => window.renderCollections?.());
  }

  if (path.includes("recycling.html")) {
    window.renderRecycling?.();
    $("saveRecycleBtn")?.addEventListener("click", async () => {
      try {
        await window.saveRecycle();
        await window.renderRecycling();
      } catch (e) {
        console.log(e);
        toast(e?.message || "Save error");
      }
    });
    $("searchRecycling")?.addEventListener("input", () => window.renderRecycling?.());
  }

  if (path.includes("staff_vehicle.html")) {
    window.renderTrips?.();
    $("saveTripBtn")?.addEventListener("click", async () => {
      await window.saveTrip?.();
    });
    $("searchTrips")?.addEventListener("input", () => window.renderTrips?.());
  }

  if (path.includes("complaints.html")) {
    window.renderComplaints?.();
    $("submitComplaintBtn")?.addEventListener("click", async () => {
      await window.saveComplaint?.();
      await window.renderComplaints?.();
    });
    $("searchComplaints")?.addEventListener("input", () => window.renderComplaints?.());
  }

  if (path.includes("dashboard.html")) window.renderDashboard?.();
  if (path.includes("bins.html")) window.renderBins?.();

  if (path.includes("tasks.html")) {
    if (window.renderTasks) window.renderTasks?.();
    else window.loadMyTasks?.();
  }

  if (path.includes("users.html")) window.loadUsers?.();
  if (path.includes("profile.html")) window.loadProfile?.();

  if (path.includes("report.html")) window.generateReport?.();
});

/* =========================
   ✅ Named exports (fixes "does not provide an export named ...")
========================= */
export { protectPage, applyRoleMenu, setActiveNav, signIn, signUp, logout };