import { API_URL as RAW_API_URL } from "./config.js";
import { supabase } from "./supabaseClient.js";

/* =========================
   Small Helpers
========================= */
function $(id) { return document.getElementById(id); }

window.toast = function (msg) {
  const t = $("toast");
  if (!t) { alert(msg); return; }
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

  const raw = await res.text(); // may be JSON OR HTML
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

  if (!res.ok) {
    const backendMsg = data?.error || data?.message || data?.supabase_error;
    let msg = backendMsg || `Request failed (${res.status})`;
    if (res.status === 404) msg = `404 Not Found: Wrong API_URL or wrong route: ${path}`;
    return { ok: false, status: res.status, data, raw, error: msg, url };
  }

  return { ok: true, status: res.status, data, raw, error: null, url };
}

/* =========================
   ROLE NORMALIZATION
========================= */
function normalizeRole(roleRaw) {
  const r = (roleRaw || "").trim().toLowerCase();
  if (r === "recycling manager" || r === "recycling-manager") return "recycling_manager";
  if (r === "driver") return "driver";
  if (r === "worker") return "worker";
  if (r === "admin") return "admin";
  return r;
}

/* =========================
   SIDEBAR ACTIVE (ACTIVATION BAR) ✅ FIX
   - Highlights current page in sidebar menu
========================= */
function getCurrentPageName() {
  const p = (window.location.pathname || "").split("/").pop() || "";
  // If opened as root folder (no file), treat as dashboard
  return p || "dashboard.html";
}

/**
 * Add .active class to the current link AND its parent <li> if present.
 * Works with:
 *   <a href="dashboard.html" class="nav-link">Dashboard</a>
 * or <li class="nav-item"><a href="..."></a></li>
 */
window.setActiveNav = function () {
  const current = getCurrentPageName();

  // Remove old active
  document.querySelectorAll(".sidebar a.active, .sidebar li.active, .nav a.active, .nav li.active")
    .forEach(el => el.classList.remove("active"));

  // Find matching anchor
  const links = Array.from(document.querySelectorAll('a[href]'));
  const match = links.find(a => {
    const href = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    return href === current;
  });

  if (!match) return;

  match.classList.add("active");

  // If link is inside <li>, also activate li
  const li = match.closest("li");
  if (li) li.classList.add("active");

  // Optional: if your sidebar has group container, add active there too
  const parent = match.closest(".nav-item");
  if (parent) parent.classList.add("active");
};

/* =========================
   AUTH (Supabase Auth + Profile)
========================= */

window.signUp = async function () {
  const roleRaw = $("role")?.value;
  const area = ($("area")?.value || "").trim();
  const email = ($("email")?.value || "").trim().toLowerCase();
  const password = $("password")?.value || "";
  const confirm = $("confirmPassword")?.value || "";
  const msg = $("msg");

  const role = normalizeRole(roleRaw);

  if (!role || !area || !email || !password) {
    if (msg) msg.textContent = "Fill all fields";
    return;
  }
  if (password !== confirm) {
    if (msg) msg.textContent = "Passwords do not match";
    return;
  }

  if (msg) msg.textContent = "Creating account...";

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data?.user) {
    if (msg) msg.textContent = error?.message || "Signup failed";
    console.log("SUPABASE SIGNUP error:", error);
    return;
  }

  const userId = data.user.id;

  // Create profile row via backend (admin bypass RLS)
  const r = await apiFetch("/api/create-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, email, role, area })
  });

  if (!r.ok) {
    if (msg) msg.textContent = r.error;
    console.log("CREATE-PROFILE debug:", { url: r.url, status: r.status, raw: r.raw });
    return;
  }

  if (msg) msg.textContent = "Account created ✅ Now login";
  setTimeout(() => (window.location = "index.html"), 900);
};

window.signIn = async function () {
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

  const user = data.user;

  localStorage.setItem("user_id", user.id);

  const accessToken = data.session?.access_token || "";
  localStorage.setItem("token", accessToken);

  const { data: p, error: perr } = await supabase
    .from("profiles")
    .select("role, area")
    .eq("id", user.id)
    .maybeSingle();

  if (perr) {
    console.log("PROFILE SELECT error:", perr);
    if (msg) msg.textContent = "Profile read blocked (RLS). Fix profiles SELECT policy.";
    return;
  }

  if (!p) {
    if (msg) msg.textContent = "Profile missing. Ask admin or signup again.";
    return;
  }

  localStorage.setItem("role", p.role);
  localStorage.setItem("area", p.area);

  window.location = "dashboard.html";
};

window.logout = async function () {
  try { await supabase.auth.signOut(); } catch {}
  localStorage.clear();
  window.location = "index.html";
};

window.protectPage = async function (allowedRoles = []) {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  if (!session) {
    localStorage.clear();
    window.location = "index.html";
    return;
  }

  const role = localStorage.getItem("role");
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    alert("Access denied for your role");
    window.location = "dashboard.html";
  }
};

/* =========================
   ROLE BASED MENU
========================= */
window.applyRoleMenu = function () {
  const role = localStorage.getItem("role");

  document.querySelectorAll(".nav-admin").forEach(e => (e.style.display = "none"));
  document.querySelectorAll(".nav-worker").forEach(e => (e.style.display = "none"));

  if (role === "admin") {
    document.querySelectorAll(".nav-admin").forEach(e => (e.style.display = "block"));
  }

  if (role === "worker" || role === "driver" || role === "recycling_manager") {
    document.querySelectorAll(".nav-worker").forEach(e => (e.style.display = "block"));
  }
};

/* =========================
   PROFILE DROPDOWN
========================= */
window.initProfileMenu = function () {
  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileDropdown");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
  });

  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => (menu.style.display = "none"));
};

/* =========================
   PROFILE PAGE LOAD
========================= */
window.loadProfile = async function () {
  const userId = localStorage.getItem("user_id");
  if (!userId) { window.location = "index.html"; return; }

  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) {
    localStorage.clear();
    window.location = "index.html";
    return;
  }

  const userEmail = sess.session.user?.email || "";
  if ($("profileEmail")) $("profileEmail").value = userEmail;

  const { data: p, error } = await supabase
    .from("profiles")
    .select("role, area")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    toast("Profile load blocked (RLS): " + error.message);
    return;
  }

  if (!p) {
    toast("Profile row not found. Signup again or ask admin.");
    return;
  }

  if ($("profileRole")) $("profileRole").value = p.role || "-";
  if ($("profileArea")) $("profileArea").value = p.area || "-";
};

window.changePassword = async function () {
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
};

/* =========================
   CORE ERP: BINS → TASKS (Supabase)
========================= */
async function getMyProfileFromStorage() {
  return {
    id: localStorage.getItem("user_id"),
    role: localStorage.getItem("role"),
    area: localStorage.getItem("area"),
  };
}

async function createPickupTaskIfNeeded(binId, area) {
  // prevent duplicate OPEN task
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

window.saveBin = async function () {
  try {
    const binId = ($("binid")?.value || "").trim();
    const area = ($("binarea")?.value || "").trim();
    const status = $("status")?.value;

    if (!binId || !area) { toast("Enter Bin ID and Area"); return; }

    const me = await getMyProfileFromStorage();

    // upsert by bin_id
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

    if (window.renderBins) window.renderBins();
  } catch (e) {
    toast("Error: " + e.message);
  }
};

window.renderBins = async function () {
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
};

/* =========================
   MY TASKS (ROLE aware)
========================= */
window.loadMyTasks = async function () {
  const tbody = $("tasksBody");
  if (!tbody) return;

  const role = localStorage.getItem("role");
  const userId = localStorage.getItem("user_id");

  let query = supabase
    .from("pickup_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (role === "worker" || role === "driver") {
    query = query.or(`assigned_worker_id.eq.${userId},assigned_driver_id.eq.${userId}`);
  }

  const { data, error } = await query;
  if (error) { tbody.innerHTML = ""; toast(error.message); return; }

  tbody.innerHTML = (data || []).map(t => `
    <tr>
      <td>${t.bin_id}</td>
      <td>${t.area}</td>
      <td>${t.status}</td>
      <td>${taskActionButton(t, role)}</td>
    </tr>
  `).join("");
};

function taskActionButton(t, role) {
  if (role === "worker" && t.status === "OPEN")
    return `<button class="btn" onclick="markCollected('${t.id}')">Mark Collected</button>`;
  if (role === "driver" && t.status === "COLLECTED")
    return `<button class="btn" onclick="markDelivered('${t.id}')">Mark Delivered</button>`;
  if (role === "recycling_manager" && t.status === "DELIVERED")
    return `<button class="btn" onclick="markRecycled('${t.id}')">Mark Recycled</button>`;
  return "-";
}

window.markCollected = async function (taskId) {
  const kg = prompt("Collected kg?");
  if (!kg) return;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({ status: "COLLECTED", collected_at: new Date().toISOString(), collected_kg: kg })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Collected ✅");

  loadMyTasks();
};

window.markDelivered = async function (taskId) {
  const { error } = await supabase
    .from("pickup_tasks")
    .update({ status: "DELIVERED", delivered_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Delivered ✅");

  loadMyTasks();
};

window.markRecycled = async function (taskId) {
  const received = prompt("Received kg?");
  if (!received) return;

  const percent = prompt("Recycle %?");
  if (!percent) return;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status: "RECYCLED",
      received_kg: received,
      recycle_percent: percent,
      recycled_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if (error) toast(error.message);
  else toast("Recycled ✅");

  loadMyTasks();
};

/* =========================
   USERS (Admin)
========================= */
let _usersCache = [];

window.loadUsers = async function () {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, area, created_at")
    .order("created_at", { ascending: false });

  if (error) { toast("Load users failed: " + error.message); return; }

  _usersCache = data || [];
  window.renderUsers();
};

window.renderUsers = function () {
  const tbody = $("usersBody");
  if (!tbody) return;

  const q = ($("searchUsers")?.value || "").toLowerCase();

  const list = (_usersCache || []).filter(u =>
    (u.email || "").toLowerCase().includes(q) ||
    (u.role || "").toLowerCase().includes(q) ||
    (u.area || "").toLowerCase().includes(q)
  );

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>${u.email || ""}</td>
      <td>
        <select id="role_${u.id}">
          ${["admin", "worker", "driver", "recycling_manager"].map(r =>
            `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`
          ).join("")}
        </select>
      </td>
      <td><input id="area_${u.id}" value="${u.area || ""}" /></td>
      <td><button type="button" class="btn" onclick="updateUser('${u.id}')">Save</button></td>
    </tr>
  `).join("");
};

window.updateUser = async function (userId) {
  const role = $("role_" + userId)?.value;
  const area = ($("area_" + userId)?.value || "").trim();

  if (!area) { toast("Area required"); return; }

  const { error } = await supabase
    .from("profiles")
    .update({ role, area })
    .eq("id", userId);

  if (error) { toast("Update failed: " + error.message); return; }

  toast("User updated ✅");
  loadUsers();
};

/* =========================
   COLLECTION MODULE ✅
========================= */
window.saveCollection = async function () {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    toast("Login required");
    window.location = "index.html";
    return;
  }

  const date = $("date")?.value;
  const area = ($("area")?.value || "").trim();
  const type = $("type")?.value;
  const qty  = Number($("qty")?.value);

  if (!date || !area || !type || !qty) {
    toast("Fill all fields");
    return;
  }

  const { error } = await supabase
    .from("collection_records")
    .insert([{
      user_id: session.user.id,
      date,
      area,
      waste_type: type,
      quantity_kg: qty
    }]);

  if (error) {
    console.log(error);
    toast("Save failed: " + error.message);
    return;
  }

  toast("Collection Saved ✅");
  await window.renderCollections();
};

window.renderCollections = async function () {
  const tbody = $("collectionsBody");
  if (!tbody) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data, error } = await supabase
    .from("collection_records")
    .select("id,date,area,waste_type,quantity_kg,created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.log(error);
    toast("Fetch failed: " + error.message);
    return;
  }

  tbody.innerHTML = "";

  (data || []).forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${r.date}</td>
        <td>${r.area}</td>
        <td>${r.waste_type}</td>
        <td>${r.quantity_kg}</td>
        <td>
          <button class="btn red" onclick="deleteCollection(${r.id})">Delete</button>
        </td>
      </tr>
    `;
  });
};

window.deleteCollection = async function(id) {
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
  await window.renderCollections();
};

/* =========================
   DASHBOARD KPIs ✅
   (Collected / Full bins / Recycled)
========================= */
window.renderDashboard = async function () {
  if (!window.location.pathname.includes("dashboard.html")) return;

  const elCollected = $("kpiCollected");
  const elFullBins = $("kpiFullBins");
  const elRecycled = $("kpiRecycled");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // Total waste collected (all records visible to this user via RLS)
  let totalCollected = 0;
  {
    const { data, error } = await supabase
      .from("collection_records")
      .select("quantity_kg");

    if (!error && data) {
      totalCollected = data.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0);
    }
  }

  // Full bins count
  let fullBins = 0;
  {
    const { data, error } = await supabase
      .from("bins")
      .select("status");

    if (!error && data) {
      fullBins = data.filter(b => (b.status || "").toLowerCase() === "full").length;
    }
  }

  // Total recycled (from pickup_tasks received_kg where status RECYCLED)
  let totalRecycled = 0;
  {
    const { data, error } = await supabase
      .from("pickup_tasks")
      .select("status, received_kg");

    if (!error && data) {
      totalRecycled = data
        .filter(t => t.status === "RECYCLED")
        .reduce((sum, t) => sum + (Number(t.received_kg) || 0), 0);
    }
  }

  if (elCollected) elCollected.textContent = `${totalCollected} kg`;
  if (elFullBins) elFullBins.textContent = `${fullBins}`;
  if (elRecycled) elRecycled.textContent = `${totalRecycled} kg`;
};

/* =========================
   Auto load per page ✅ + Activation bar
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Role menu + profile dropdown (common)
  try { window.applyRoleMenu?.(); } catch {}
  try { window.initProfileMenu?.(); } catch {}
  try { window.setActiveNav?.(); } catch {} // ✅ activation bar highlight

  const path = window.location.pathname;

  if (path.includes("collection.html")) window.renderCollections?.();
  if (path.includes("dashboard.html")) window.renderDashboard?.();
  if (path.includes("bins.html")) window.renderBins?.();
  if (path.includes("tasks.html")) window.loadMyTasks?.();
  if (path.includes("users.html")) window.loadUsers?.();
  if (path.includes("profile.html")) window.loadProfile?.();

  // If you have a report page, call it too safely
  if (path.includes("report.html")) window.generateReport?.();
});

/* =========================
   REPORTS (Auto from DB)
========================= */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

window.renderReports = async function () {
  // must be logged in
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    toast("Login required");
    window.location = "index.html";
    return;
  }

  // 1) TOTAL COLLECTED + BY TYPE (from collection_records)
  const { data: collections, error: cErr } = await supabase
    .from("collection_records")
    .select("waste_type, quantity_kg");

  if (cErr) { toast("Report error: " + cErr.message); return; }

  let totalCollected = 0;
  const typeTotals = { Wet: 0, Dry: 0, Plastic: 0 };

  (collections || []).forEach(r => {
    const kg = Number(r.quantity_kg || 0);
    totalCollected += kg;
    const t = (r.waste_type || "").trim();
    if (typeTotals[t] != null) typeTotals[t] += kg;
  });

  setText("repTotalCollected", `${totalCollected} kg`);
  setText("repCollectionCount", `${(collections || []).length}`);

  // Fill waste type table
  const tbody = document.getElementById("wasteTypeBody");
  if (tbody) {
    tbody.innerHTML = ["Wet","Dry","Plastic"].map(t => `
      <tr>
        <td>${t}</td>
        <td>${typeTotals[t] || 0}</td>
      </tr>
    `).join("");
  }

  // 2) FULL BINS (from bins)
  const { count: fullBinsCount, error: bErr } = await supabase
    .from("bins")
    .select("*", { count: "exact", head: true })
    .eq("status", "Full");

  if (bErr) { toast("Bins report error: " + bErr.message); return; }
  setText("repFullBins", `${fullBinsCount || 0}`);

  // 3) TRIPS COMPLETED (from pickup_tasks status)
  const { count: tripsDone, error: tErr } = await supabase
    .from("pickup_tasks")
    .select("*", { count: "exact", head: true })
    .eq("status", "RECYCLED");

  if (tErr) { toast("Trips report error: " + tErr.message); return; }
  setText("repTripsCompleted", `${tripsDone || 0}`);

  // 4) TOTAL RECYCLED + LANDFILL (from recycling table)
  const { data: recRows, error: rErr } = await supabase
    .from("recycling")
    .select("recycled_kg, landfill_kg");

  if (rErr) {
    console.log("Recycling table error:", rErr);
    setText("repTotalRecycled", `0 kg`);
    setText("repLandfill", `0 kg`);
    setText("repRecyclingCount", `0`);
  } else {
    let totalRecycled = 0;
    let totalLandfill = 0;

    (recRows || []).forEach(r => {
      totalRecycled += Number(r.recycled_kg || 0);
      totalLandfill += Number(r.landfill_kg || 0);
    });

    setText("repTotalRecycled", `${totalRecycled} kg`);
    setText("repLandfill", `${totalLandfill} kg`);
    setText("repRecyclingCount", `${(recRows || []).length}`);
  }

  // 5) Insight (simple text)
  const insight = document.getElementById("repInsight");
  if (insight) {
    insight.textContent =
      `Total collected: ${totalCollected} kg. Full bins: ${fullBinsCount || 0}. ` +
      `Trips completed: ${tripsDone || 0}.`;
  }
};

window.generateReport = async function () {
  try {
    const elTotalCollected = document.getElementById("kpiTotalCollected");
    const elTotalRecycled  = document.getElementById("kpiTotalRecycled");
    const elTotalLandfill  = document.getElementById("kpiTotalLandfill");
    const elFullBins       = document.getElementById("kpiFullBins");
    const elCollCount      = document.getElementById("kpiCollectionCount");
    const elRecCount       = document.getElementById("kpiRecyclingCount");
    const tbody            = document.getElementById("typeBreakdownBody");
    const barChart         = document.getElementById("barChart");
    const insightText      = document.getElementById("insightText");

    // Must be logged-in
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session) {
      toast("Login required");
      window.location = "index.html";
      return;
    }

    // 1) COLLECTION RECORDS (ALL USERS)
    const { data: collections, error: cErr } = await supabase
      .from("collection_records")
      .select("waste_type, quantity_kg");

    if (cErr) throw new Error("collection_records SELECT blocked: " + cErr.message);

    // 2) BINS (for Full count)
    const { data: bins, error: bErr } = await supabase
      .from("bins")
      .select("status");

    if (bErr) throw new Error("bins SELECT blocked: " + bErr.message);

    // 3) RECYCLING (ALL USERS)
    const { data: recycling, error: rErr } = await supabase
      .from("recycling")
      .select("recycled_kg, landfill_kg");

    const recyclingRows = rErr ? [] : (recycling || []);

    // ---------- Calculate KPIs ----------
    const totalCollected = (collections || []).reduce((s, x) => s + (Number(x.quantity_kg) || 0), 0);
    const collectionCount = (collections || []).length;

    const fullBinsCount = (bins || []).filter(b => (b.status || "").toLowerCase() === "full").length;

    const totalRecycled = recyclingRows.reduce((s, x) => s + (Number(x.recycled_kg) || 0), 0);
    const totalLandfill = recyclingRows.reduce((s, x) => s + (Number(x.landfill_kg) || 0), 0);
    const recyclingCount = recyclingRows.length;

    if (elTotalCollected) elTotalCollected.textContent = `${totalCollected} kg`;
    if (elTotalRecycled)  elTotalRecycled.textContent  = `${totalRecycled} kg`;
    if (elTotalLandfill)  elTotalLandfill.textContent  = `${totalLandfill} kg`;

    if (elFullBins)   elFullBins.textContent   = `${fullBinsCount}`;
    if (elCollCount)  elCollCount.textContent  = `${collectionCount}`;
    if (elRecCount)   elRecCount.textContent   = `${recyclingCount}`;

    // ---------- Breakdown by Type ----------
    const byType = { Wet: 0, Dry: 0, Plastic: 0 };

    (collections || []).forEach(x => {
      const t = (x.waste_type || "").trim();
      const q = Number(x.quantity_kg) || 0;
      if (!byType[t]) byType[t] = 0;
      byType[t] += q;
    });

    if (tbody) {
      tbody.innerHTML = Object.entries(byType)
        .map(([type, sum]) => `<tr><td>${type}</td><td>${sum}</td></tr>`)
        .join("");
    }

    if (barChart) {
      const max = Math.max(...Object.values(byType), 1);
      barChart.innerHTML = Object.entries(byType).map(([type, sum]) => {
        const pct = Math.round((sum / max) * 100);
        return `
          <div style="display:grid; grid-template-columns:120px 1fr 80px; gap:10px; align-items:center;">
            <div style="opacity:.9;">${type}</div>
            <div style="background:rgba(255,255,255,.08); border-radius:10px; overflow:hidden;">
              <div style="height:14px; width:${pct}%; background:rgba(255,255,255,.35);"></div>
            </div>
            <div style="text-align:right; opacity:.9;">${sum} kg</div>
          </div>
        `;
      }).join("");
    }

    if (insightText) {
      const topType = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0];
      insightText.textContent =
        fullBinsCount > 0
          ? `⚠️ ${fullBinsCount} bins are FULL. Priority pickup needed. Top collected waste: ${topType[0]} (${topType[1]} kg).`
          : `✅ No full bins right now. Top collected waste: ${topType[0]} (${topType[1]} kg).`;
    }

    toast("Report updated ✅");

  } catch (e) {
    console.log(e);
    toast(e.message);
  }
};

/* =========================
   ✅ Named exports (fixes: "does not provide an export named ...")
========================= */
export const protectPage = window.protectPage;
export const applyRoleMenu = window.applyRoleMenu;
export const setActiveNav = window.setActiveNav;