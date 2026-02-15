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
    const backendMsg = data?.error || data?.message;
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
   AUTH (Backend Token)
========================= */

// SIGNUP -> backend /api/signup
window.signUp = async function () {
  const roleRaw = $("role")?.value;
  const area = ($("area")?.value || "").trim();
  const email = ($("email")?.value || "").trim();
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

  const r = await apiFetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role, area })
  });

  if (!r.ok) {
    if (msg) msg.textContent = r.error;
    console.log("SIGNUP debug:", { url: r.url, status: r.status, raw: r.raw });
    return;
  }

  if (msg) msg.textContent = "Account created ✅ Now login";
  setTimeout(() => (window.location = "index.html"), 1200);
};


// LOGIN -> backend /api/login
window.signIn = async function () {
  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";
  const msg = $("msg");

  if (!email || !password) {
    if (msg) msg.textContent = "Enter email and password";
    return;
  }

  if (msg) msg.textContent = "Connecting to server...";

  const r = await apiFetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!r.ok) {
    if (msg) msg.textContent = r.error;
    console.log("LOGIN debug:", { url: r.url, status: r.status, raw: r.raw });
    return;
  }

  const data = r.data; // { token, user: {id,email}, profile: {role,area,...} }

  // store session token
  localStorage.setItem("token", data.token);
  localStorage.setItem("user_id", data.user.id);

  // ✅ BEST: use profile returned by backend
  if (data.profile?.role) localStorage.setItem("role", data.profile.role);
  if (data.profile?.area) localStorage.setItem("area", data.profile.area);

  // If profile wasn't included for some reason, fallback to /api/profile
  if (!data.profile?.role || !data.profile?.area) {
    const pr = await apiFetch("/api/profile", {
      headers: { Authorization: "Bearer " + data.token }
    });

    if (!pr.ok) {
      if (msg) msg.textContent = "Profile not found. Ask admin / signup again.";
      console.log("PROFILE debug:", { url: pr.url, status: pr.status, raw: pr.raw });
      return;
    }

    localStorage.setItem("role", pr.data.role);
    localStorage.setItem("area", pr.data.area);
  }

  window.location = "dashboard.html";
};


window.logout = async function () {
  localStorage.clear();
  window.location = "index.html";
};


// PROTECT PAGE (token check via backend /api/me)
window.protectPage = async function (allowedRoles = []) {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location = "index.html";
    return;
  }

  const r = await apiFetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!r.ok) {
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
   PROFILE PAGE LOAD (profile.html)
========================= */
window.loadProfile = async function () {
  const token = localStorage.getItem("token");
  if (!token) { window.location = "index.html"; return; }

  // verify token with backend
  const me = await apiFetch("/api/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!me.ok) {
    localStorage.clear();
    window.location = "index.html";
    return;
  }

  if ($("profileEmail")) $("profileEmail").value = me.data.email || "";

  // ✅ get profile from backend (no RLS issue)
  const pr = await apiFetch("/api/profile", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!pr.ok) {
    toast("Profile not found. Ask admin / signup again.");
    return;
  }

  if ($("profileRole")) $("profileRole").value = pr.data.role || "-";
  if ($("profileArea")) $("profileArea").value = pr.data.area || "-";
};


// Change password (Supabase Auth) -> OPTIONAL
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

  // assign 1 worker + 1 driver from same area
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
