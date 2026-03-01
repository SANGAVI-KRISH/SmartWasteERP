// app.js (FULL UPDATED v3.8 - Manual + Trip + Collection Activity Logs with Vehicle)
// ✅ Fixes / Adds (v3.8)
// 1) Manual task creation inserts into pickup_tasks AND staff_tasks Activity Logs (with Vehicle)
// 2) Activity Logs shows BOTH TRIP + MANUAL (+ optional COLLECTION logs)
// 3) Manual logs show STAFF (profiles) and VEHICLE (manual input or "MANUAL")
// 4) ✅ NEW: When Worker/Driver marks a Pickup Task as COLLECTED, app.js creates a COLLECTION log in staff_tasks
//    (includes vehicle_id if available from latest collection_records OR "UNKNOWN")
// 5) Fixed profiles lookup (eq("id", assignTo)) and removed duplicate blocks
//
// ⚠️ Note:
// - If your collection_records table does NOT have vehicle_id column, the collection log will show "UNKNOWN" vehicle.
// - If you want vehicle_id saved in collection_records, add column: vehicle_id text (optional) and update collection.html insert.
// - staff_tasks must allow inserts for task_type "COLLECTION" (RLS policy should allow).

import { API_URL as RAW_API_URL } from "./config.js";
import { supabase } from "./supabaseClient.js";

/* =========================
   CONFIG TOGGLES (EDIT IF NEEDED)
========================= */
const HAS_COMPLAINT_CREATED_BY = true;
const COLLECTION_HAS_TASK_AND_BIN = true;
const COLLECTION_HAS_STAFF_TASK_ID = true;
const STAFF_TASK_HAS_TIMESTAMPS = true;
const REQUIRE_COLLECTED_KG_PROMPT = true;

// ✅ Hide Empty bins in Bin Status list (so collected bins disappear)
const HIDE_EMPTY_BINS_ON_BINS_PAGE = true;

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

  const synced = await syncProfileToStorage();
  const role = synced?.role || getStoredRole();

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(role)) {
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
   ✅ PROFILE SAFE GETTER (USED BY ADMIN MODULES)
========================= */
async function getMyProfileSafe() {
  const { data: sess } = await supabase.auth.getSession();
  const session = sess?.session;
  if (!session) return null;

  const uid = session.user?.id;
  if (!uid) return null;

  const { data: p, error } = await supabase
    .from("profiles")
    .select("id, role, area, full_name, email")
    .eq("id", uid)
    .maybeSingle();

  if (error) return null;
  if (!p) return null;

  return {
    id: p.id,
    role: normalizeRole(p.role),
    area: p.area || "",
    full_name: p.full_name || "",
    email: p.email || session.user?.email || ""
  };
}
window.getMyProfileSafe = getMyProfileSafe;

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
   BIN HELPERS ✅
========================= */
async function setBinStatusByBinId(binId, status) {
  const b = (binId || "").trim();
  if (!b) return { ok: false, error: "Missing bin id" };

  const meId = localStorage.getItem("user_id") || null;

  const { data: found, error: fErr } = await supabase
    .from("bins")
    .select("id")
    .eq("bin_id", b)
    .limit(1);

  if (fErr) return { ok: false, error: fErr.message };

  if (found?.length) {
    const { error } = await supabase
      .from("bins")
      .update({ status, updated_at: new Date().toISOString(), updated_by: meId })
      .eq("id", found[0].id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("bins")
      .insert([{ bin_id: b, area: "", status, updated_by: meId }]);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
window.setBinStatusByBinId = setBinStatusByBinId;

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

/**
 * ✅ Safe insert helper for pickup_tasks.
 */
async function safeInsertPickupTask(payload, fallbackPayload) {
  let { error } = await supabase.from("pickup_tasks").insert([payload]);
  if (!error) return { ok: true };

  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("column") && msg.includes("does not exist") && fallbackPayload) {
    const r2 = await supabase.from("pickup_tasks").insert([fallbackPayload]);
    if (r2.error) return { ok: false, error: r2.error.message };
    return { ok: true, usedFallback: true };
  }

  return { ok: false, error: error.message };
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

  const payload = {
    bin_id: binId,
    area,
    assigned_worker_id: workers?.[0]?.id || null,
    assigned_driver_id: drivers?.[0]?.id || null,
    status: "OPEN"
  };

  const r = await safeInsertPickupTask(payload, payload);
  if (!r.ok) throw new Error(r.error);
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

/* =========================
   ✅ ADMIN: ASSIGN BIN TASK (bins.html modal)
========================= */
window.openAssignBinModal = async function (binId) {
  try {
    const me = await getMyProfileSafe();
    if (!me || me.role !== "admin") return toast("Only admin can assign.");

    const modal = $("assignBinModal");
    if (!modal) return toast("Assign modal missing in bins.html");

    $("assignBinId").value = binId;

    const { data: staff, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, area")
      .in("role", ["worker", "driver"])
      .order("full_name", { ascending: true });

    if (error) return toast("Load staff failed: " + error.message);

    const sel = $("assignBinTo");
    if (sel) {
      sel.innerHTML = `<option value="">-- Select Staff --</option>`;
      (staff || []).forEach(u => {
        const label = `${u.full_name || u.email} (${normalizeRole(u.role)})`;
        sel.innerHTML += `<option value="${u.id}" data-role="${normalizeRole(u.role)}">${label}</option>`;
      });
    }

    if ($("assignBinPriority")) $("assignBinPriority").value = "normal";
    if ($("assignBinNotes")) $("assignBinNotes").value = "";

    modal.style.display = "flex";
    document.body.classList.add("modal-open");
  } catch (e) {
    console.log(e);
    toast("Open modal failed: " + (e?.message || e));
  }
};

window.closeAssignBinModal = function () {
  const modal = $("assignBinModal");
  if (modal) modal.style.display = "none";
  document.body.classList.remove("modal-open");
};

window.confirmAssignBin = async function () {
  try {
    const me = await getMyProfileSafe();
    if (!me || me.role !== "admin") return toast("Only admin can assign.");

    const binId = ($("assignBinId")?.value || "").trim();
    const staffId = ($("assignBinTo")?.value || "").trim();
    const notes = ($("assignBinNotes")?.value || "").trim();
    const priority = ($("assignBinPriority")?.value || "normal").trim();

    if (!binId) return toast("Bin ID missing.");
    if (!staffId) return toast("Select staff.");

    const { data: binRow, error: bErr } = await supabase
      .from("bins")
      .select("bin_id, area, status")
      .eq("bin_id", binId)
      .maybeSingle();

    if (bErr) return toast("Bin fetch failed: " + bErr.message);

    const staffRole = normalizeRole(
      $("assignBinTo")?.selectedOptions?.[0]?.getAttribute("data-role") || ""
    );

    const payload = {
      bin_id: binId,
      area: binRow?.area || "",
      status: "OPEN",
      assigned_worker_id: staffRole === "worker" ? staffId : null,
      assigned_driver_id: staffRole === "driver" ? staffId : null,
      priority,
      notes,
      assigned_by: me.id
    };

    const fallback = {
      bin_id: binId,
      area: binRow?.area || "",
      status: "OPEN",
      assigned_worker_id: staffRole === "worker" ? staffId : null,
      assigned_driver_id: staffRole === "driver" ? staffId : null,
    };

    const r = await safeInsertPickupTask(payload, fallback);
    if (!r.ok) return toast("Assign failed: " + r.error);

    toast("Assigned ✅ Pickup task created");
    window.closeAssignBinModal?.();

    try { window.renderBins?.(); } catch {}
    try { window.renderTasks?.(); } catch {}
  } catch (e) {
    console.log(e);
    toast("Assign failed: " + (e?.message || e));
  }
};

/* =========================
   ✅ ADMIN: MANUAL TASK ASSIGN (staff_vehicle.html)
========================= */
window.initAdminManualTaskUI = async function () {
  try {
    const card = $("adminManualTaskCard");
    if (!card) return;

    const me = await getMyProfileSafe();
    if (!me || me.role !== "admin") {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";

    const { data: staff, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, area")
      .in("role", ["worker", "driver"])
      .order("full_name", { ascending: true });

    if (error) return toast("Load staff failed: " + error.message);

    const sel = $("manualAssignTo");
    if (sel) {
      sel.innerHTML = `<option value="">-- Select Staff --</option>`;
      (staff || []).forEach(u => {
        const label = `${u.full_name || u.email} (${normalizeRole(u.role)})`;
        sel.innerHTML += `<option value="${u.id}" data-role="${normalizeRole(u.role)}" data-area="${u.area || ""}">${label}</option>`;
      });
    }

    const due = $("manualDueDate");
    if (due && !due.value) due.value = new Date().toISOString().slice(0, 10);
  } catch (e) {
    console.log(e);
    toast("Init manual task failed: " + (e?.message || e));
  }
};

/* ===============================
   ✅ Helper: create an Activity Log row in staff_tasks (Manual Task)
================================= */
async function addActivityLogFromManualTask({
  logDate,
  vehicleId = "",
  assignedTo = null,
  staffName = "",
  route = "",
  shift = "Morning",
  status = "Assigned",
  taskId = null,
}) {
  const payload = {
    task_type: "MANUAL",
    date: logDate,
    vehicle_id: vehicleId && vehicleId.trim() !== "" ? vehicleId : "MANUAL",
    assigned_to: assignedTo,
    staff_name: staffName && staffName.trim() !== "" ? staffName : "Unknown",
    route: route || "Manual Assignment",
    shift: shift || "Morning",
    status: status || "Assigned",
    task_id: taskId || null,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("staff_tasks").insert([payload]);
  if (error) throw error;
}

/* ===============================
   ✅ Admin: Create & Assign Manual Task (pickup_tasks + staff_tasks log)
================================= */
window.createManualTask = async function () {
  try {
    const me = await getMyProfileSafe();
    if (!me || me.role !== "admin") return toast("Only admin can create tasks.");

    const assignTo = (document.getElementById("manualAssignTo")?.value || "").trim();
    const taskType = (document.getElementById("manualTaskType")?.value || "pickup").trim();
    const binId = (document.getElementById("manualBinId")?.value || "").trim() || null;
    const route = (document.getElementById("manualRoute")?.value || "").trim();
    const priority = (document.getElementById("manualPriority")?.value || "normal").trim();
    const dueDate = (document.getElementById("manualDueDate")?.value || new Date().toISOString().slice(0, 10)).trim();
    const notes = (document.getElementById("manualNotes")?.value || "").trim();

    // ✅ Optional manual vehicle input (add this input in staff_vehicle.html if you want)
    // <input id="manualVehicleId" placeholder="Eg: TN-37-WM-1023" />
    const manualVehicleId = (document.getElementById("manualVehicleId")?.value || "").trim();

    if (!assignTo) return toast("Select staff to assign");
    if (!route) return toast("Enter Area / Route");

    const role = document.getElementById("manualAssignTo")
      ?.selectedOptions?.[0]?.getAttribute("data-role") || "worker";

    // 1) Create pickup task
    const { data: createdTask, error: taskErr } = await supabase
      .from("pickup_tasks")
      .insert([{
        bin_id: binId,
        area: route,
        status: "OPEN",
        assigned_worker_id: role === "worker" ? assignTo : null,
        assigned_driver_id: role === "driver" ? assignTo : null,
        priority,
        due_date: dueDate,
        notes: notes ? `[${taskType.toUpperCase()}] ${notes}` : `[${taskType.toUpperCase()}]`,
        assigned_by: me.id
      }])
      .select("id")
      .single();

    if (taskErr) throw taskErr;

    const newTaskId = createdTask?.id || null;

    // 2) Staff name (label + profiles confirmation)
    const staffLabel =
      document.getElementById("manualAssignTo")?.selectedOptions?.[0]?.textContent?.trim() || "";

    let staffName = staffLabel.split(" (")[0].trim();
    if (!staffName) staffName = assignTo;

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", assignTo)
      .maybeSingle();

    if (!pErr && prof) staffName = prof.full_name || prof.email || staffName;

    // 3) Insert Activity Log row (staff_tasks)
    await addActivityLogFromManualTask({
      logDate: dueDate,
      vehicleId: manualVehicleId,   // blank -> becomes "MANUAL"
      assignedTo: assignTo,
      staffName,
      route,
      shift: "Morning",
      status: "Assigned",
      taskId: newTaskId,
    });

    toast("Manual task created + added to Activity Logs ✅");

    if (document.getElementById("manualBinId")) document.getElementById("manualBinId").value = "";
    if (document.getElementById("manualRoute")) document.getElementById("manualRoute").value = "";
    if (document.getElementById("manualNotes")) document.getElementById("manualNotes").value = "";
    if (document.getElementById("manualVehicleId")) document.getElementById("manualVehicleId").value = "";

    try { window.renderTrips?.(); } catch {}
    try { window.renderTasks?.(); } catch {}
  } catch (e) {
    console.log(e);
    toast("Create task failed: " + (e?.message || e));
  }
};

/* =========================
   BINS LIST RENDER (UPDATED: admin Assign button)
========================= */
async function renderBins() {
  const tbody = $("binsBody");
  if (!tbody) return;

  const q = ($("searchBins")?.value || "").toLowerCase();
  const role = getStoredRole();

  const { data, error } = await supabase
    .from("bins")
    .select("bin_id, area, status, updated_at")
    .order("updated_at", { ascending: false });

  if (error) { tbody.innerHTML = ""; toast(error.message); return; }

  const pill = (s) => s === "Full" ? "bad" : (s === "Half" ? "warn" : "good");

  let list = (data || []).filter(x =>
    (x.bin_id || "").toLowerCase().includes(q) ||
    (x.area || "").toLowerCase().includes(q) ||
    (x.status || "").toLowerCase().includes(q)
  );

  if (HIDE_EMPTY_BINS_ON_BINS_PAGE) {
    list = list.filter(x => String(x.status || "").toLowerCase() !== "empty");
  }

  const isAdmin = role === "admin";

  tbody.innerHTML = list.map(x => {
    const assignBtn = isAdmin
      ? `<td><button class="btn" onclick="openAssignBinModal('${String(x.bin_id).replace(/'/g, "\\'")}')">Assign</button></td>`
      : "";

    return `
      <tr>
        <td>${x.bin_id}</td>
        <td>${x.area}</td>
        <td><span class="pill ${pill(x.status)}">${x.status}</span></td>
        <td>${x.updated_at ? new Date(x.updated_at).toLocaleString() : ""}</td>
        ${assignBtn}
      </tr>
    `;
  }).join("");
}
window.renderBins = renderBins;

/* =========================
   STAFF TASKS (TRIP)
========================= */
async function findUserIdByNameOrEmail(text) {
  const key = (text || "").trim();
  if (!key) return null;

  if (key.includes("@")) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", key)
      .maybeSingle();
    if (error) return null;
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
      toast("Staff not found. Enter exact Full Name (must exist in Users).");
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
      created_by: session.user.id,
      staff_name
    };

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

    toast("Trip Assigned ✅");
    await window.renderTrips?.();
  } catch (e) {
    console.log(e);
    toast("Save error: " + (e?.message || e));
  }
}
window.saveTrip = saveTrip;

function getTripTbody() {
  return (
    document.getElementById("tripsBody") ||
    document.getElementById("activityBody") ||
    document.getElementById("activityTbody") ||
    document.querySelector("#activityLogs tbody") ||
    null
  );
}

async function renderTrips() {
  const tbody = getTripTbody();
  if (!tbody) return;

  const q = (document.getElementById("searchTrips")?.value || "").toLowerCase().trim();

  const selectCols = STAFF_TASK_HAS_TIMESTAMPS
    ? "id,task_type,date,vehicle_id,route,shift,status,created_at,assigned_to,staff_name,task_id,started_at,completed_at"
    : "id,task_type,date,vehicle_id,route,shift,status,created_at,assigned_to,staff_name,task_id";

  const { data, error } = await supabase
    .from("staff_tasks")
    .select(selectCols)
    .in("task_type", ["TRIP", "MANUAL", "COLLECTION"])
    .order("created_at", { ascending: false });

  if (error) { console.log(error); toast("Fetch failed: " + error.message); return; }

  const rows = (data || []);
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
    const staffLabel = nameMap[r.assigned_to] || r.staff_name || r.assigned_to || "";
    const s = `${r.task_type || ""} ${r.date} ${r.vehicle_id} ${staffLabel} ${r.route} ${r.shift} ${r.status} ${r.task_id || ""}`.toLowerCase();
    return !q || s.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8">No logs found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const staffLabel =
      nameMap[r.assigned_to] ||
      r.staff_name ||
      (r.assigned_to ? (r.assigned_to.slice(0, 6) + "…") : "-");

    const showTask = r.task_id || r.id || "";

    return `
      <tr>
        <td>${r.date || ""}</td>
        <td>${r.vehicle_id || ""}</td>
        <td>${staffLabel}</td>
        <td>${r.route || ""}</td>
        <td>${r.shift || ""}</td>
        <td>${r.status || ""}</td>
        <td>${showTask}</td>
        <td>
          <button class="btn red" onclick="deleteTripLog('${r.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}
window.renderTrips = renderTrips;

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

/* =========================
   Trip status update
========================= */
async function updateStaffTaskStatus(taskId, newStatus) {
  try {
    if (!taskId) return { ok: false, error: "Missing taskId" };

    const role = (localStorage.getItem("role") || "").toLowerCase();
    const userId = localStorage.getItem("user_id");

    const payload = { status: newStatus };

    if (STAFF_TASK_HAS_TIMESTAMPS) {
      if (newStatus === "Started") payload.started_at = new Date().toISOString();
      if (newStatus === "Completed") payload.completed_at = new Date().toISOString();
    }

    let q = supabase.from("staff_tasks").update(payload).eq("id", taskId);
    if (role !== "admin") q = q.eq("assigned_to", userId);

    const { data, error } = await q.select("id,status,started_at,completed_at");

    if (error) {
      console.log("updateStaffTaskStatus ERROR:", error);
      window.toast?.("Update failed: " + error.message);
      return { ok: false, error: error.message };
    }

    if (!data || data.length === 0) {
      window.toast?.("No row updated ❌ (not assigned / RLS blocks UPDATE)");
      return { ok: false, error: "No row updated" };
    }

    const row = data[0];
    window.toast?.(`Trip ${row.status} ✅`);

    try { await window.renderTrips?.(); } catch {}
    try { await window.renderTasks?.(); } catch {}

    return { ok: true, data: row };
  } catch (e) {
    console.log("updateStaffTaskStatus EX:", e);
    window.toast?.("Update failed: " + (e?.message || e));
    return { ok: false, error: e?.message || String(e) };
  }
}
window.updateStaffTaskStatus = updateStaffTaskStatus;

async function completeTripToCollection(taskId) {
  const r = await updateStaffTaskStatus(taskId, "Completed");
  if (!r.ok) return;

  setTimeout(() => {
    window.location = `collection.html?staff_task_id=${encodeURIComponent(taskId)}&mode=trip`;
  }, 350);
}
window.completeTripToCollection = completeTripToCollection;

/* =========================
   Mandatory check helpers
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
   TASKS BUTTONS ✅ (EXPOSED)
========================= */
function tripActionButton(t, role) {
  if (role !== "admin") {
    if (t.status === "Assigned") {
      return `<button class="btn" onclick="updateStaffTaskStatus('${t.id}','Started')">Work Started</button>`;
    }
    if (t.status === "Started") {
      return `<button class="btn" onclick="completeTripToCollection('${t.id}')">Work Completed</button>`;
    }
    return "✅ Done";
  }
  return "-";
}
window.tripActionButton = tripActionButton;

// ✅ Collection shortcut button
function goToCollectionForPickup(taskId, binId, area = "") {
  const q = new URLSearchParams();
  if (taskId) q.set("task_id", taskId);
  if (binId) q.set("bin_id", binId);
  if (area) q.set("area", area);
  q.set("mode", "pickup");
  q.set("autofill", "1");
  window.location = `collection.html?${q.toString()}`;
}
window.goToCollectionForPickup = goToCollectionForPickup;

function pickupActionButton(t, role) {
  if ((role === "worker" || role === "driver") && t.status === "OPEN") {
    const btn1 = `<button class="btn" onclick="goToCollectionForPickup('${t.id}','${t.bin_id || ""}','${(t.area || "").replaceAll("'", "\\'")}')">Collection</button>`;
    const btn2 = `<button class="btn" style="margin-left:8px;" onclick="markCollected('${t.id}')">Mark Collected</button>`;
    return `${btn1}${btn2}`;
  }

  if (role === "driver" && t.status === "COLLECTED")
    return `<button class="btn" onclick="markDelivered('${t.id}')">Mark Delivered</button>`;

  if (role === "recycling_manager" && t.status === "DELIVERED")
    return `<button class="btn" onclick="markReceived('${t.id}')">Mark Received</button>`;

  if (role === "recycling_manager" && t.status === "RECEIVED")
    return `<button class="btn" onclick="markRecycled('${t.id}')">Mark Recycled</button>`;

  return "-";
}
window.pickupActionButton = pickupActionButton;

/* =========================
   ✅ COLLECTION LOG HELPERS (NEW)
========================= */
async function addCollectionActivityLog({ date, vehicle_id, staff_id, staff_name, route, task_id }) {
  const payload = {
    task_type: "COLLECTION",
    date: date || new Date().toISOString().slice(0, 10),
    vehicle_id: (vehicle_id && vehicle_id.trim()) ? vehicle_id.trim() : "UNKNOWN",
    assigned_to: staff_id || null,
    staff_name: staff_name || null,
    route: route || null,
    shift: "-",
    status: "Collected",
    task_id: task_id || null,
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("staff_tasks").insert([payload]);
  if (error) throw error;
}
window.addCollectionActivityLog = addCollectionActivityLog;

// Try to read vehicle_id from latest collection_records (if the column exists).
async function getLatestCollectionVehicleForPickupTask(taskId) {
  try {
    // Try with vehicle_id column
    const r1 = await supabase
      .from("collection_records")
      .select("vehicle_id,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!r1.error) {
      const v = r1.data?.[0]?.vehicle_id;
      return (v && String(v).trim()) ? String(v).trim() : null;
    }

    // If column doesn't exist, ignore
    const msg = (r1.error?.message || "").toLowerCase();
    if (msg.includes("column") && msg.includes("does not exist")) return null;

    return null;
  } catch {
    return null;
  }
}

async function createCollectionLogForPickupTask(taskId) {
  try {
    if (!taskId) return;

    // pickup_tasks gives area + assigned staff
    const { data: task, error: tErr } = await supabase
      .from("pickup_tasks")
      .select("id,area,assigned_worker_id,assigned_driver_id")
      .eq("id", taskId)
      .maybeSingle();

    if (tErr || !task) return;

    const staffId = task.assigned_worker_id || task.assigned_driver_id || null;

    let staffName = null;
    if (staffId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,email")
        .eq("id", staffId)
        .maybeSingle();

      staffName = prof?.full_name || prof?.email || null;
    }

    const vehicle = await getLatestCollectionVehicleForPickupTask(taskId);

    await addCollectionActivityLog({
      date: new Date().toISOString().slice(0, 10),
      vehicle_id: vehicle || "UNKNOWN",
      staff_id: staffId,
      staff_name: staffName,
      route: task.area || "",
      task_id: taskId
    });

    // refresh logs if on staff_vehicle.html
    try { await window.renderTrips?.(); } catch {}
  } catch (e) {
    console.log("createCollectionLogForPickupTask error:", e);
  }
}

/* =========================
   Pickup workflow (status + BIN sync) ✅
========================= */
async function markCollected(taskId) {
  const ok = await hasCollectionForTask(taskId);
  if (!ok) {
    const { data: taskRow, error: tErr } = await supabase
      .from("pickup_tasks")
      .select("id,bin_id,area")
      .eq("id", taskId)
      .maybeSingle();

    if (tErr) {
      toast("❌ Collection entry required. (Task fetch failed: " + tErr.message + ")");
      setTimeout(() => { window.location = "collection.html"; }, 700);
      return;
    }

    toast("❌ Save Collection entry first. Opening Collection page...");
    setTimeout(() => {
      goToCollectionForPickup(taskId, taskRow?.bin_id || "", taskRow?.area || "");
    }, 700);
    return;
  }

  let kg = null;
  if (REQUIRE_COLLECTED_KG_PROMPT) {
    const kgRaw = prompt("Collected kg? (Enter same kg as collection entry)");
    if (kgRaw === null) return;
    kg = Number(kgRaw);
    if (Number.isNaN(kg) || kg <= 0) { toast("Enter valid collected kg"); return; }
  }

  const { data: taskRow, error: tErr } = await supabase
    .from("pickup_tasks")
    .select("id,bin_id")
    .eq("id", taskId)
    .maybeSingle();

  if (tErr) {
    toast("Fetch failed: " + tErr.message);
    return;
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

  if (error) {
    toast(error.message);
    return;
  }

  // ✅ Once collected -> bin becomes Empty
  if (taskRow?.bin_id) {
    const r = await setBinStatusByBinId(taskRow.bin_id, "Empty");
    if (!r.ok) console.log("Bin status update failed:", r.error);
  }

  // ✅ NEW: Add COLLECTION log into staff_tasks (with vehicle if available)
  await createCollectionLogForPickupTask(taskId);

  toast("Collected ✅ Bin marked Empty ✅ (Activity Log updated)");

  try { window.renderBins?.(); } catch {}
  try { window.renderTasks?.(); } catch {}
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
   COMPLAINTS MODULE
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

  if (page === "index.html" || page === "register.html" || page === "") return;

  try { window.applyRoleMenu?.(); } catch {}
  try { await window.protectPage?.(); } catch {}
  try { window.initProfileMenu?.(); } catch {}
  try { window.setActiveNav?.(); } catch {}

  const path = window.location.pathname;

  if (path.includes("staff_vehicle.html")) {
    try { await window.initAdminManualTaskUI?.(); } catch {}

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

  if (path.includes("users.html")) window.loadUsers?.();
  if (path.includes("profile.html")) window.loadProfile?.();

  if (path.includes("report.html")) window.generateReport?.();
});

/* =========================
   ✅ Named exports
========================= */
export { protectPage, applyRoleMenu, setActiveNav, signIn, signUp, logout };