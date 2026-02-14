import { supabase } from "./supabaseClient.js";

/* =========================
   Small Helpers
========================= */
function $(id){ return document.getElementById(id); }

window.toast = function(msg){
  const t = $("toast");
  if(!t){ alert(msg); return; }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> t.style.display="none", 1700);
};

/* =========================
   AUTH (Supabase)
========================= */
window.signUp = async function(){
  const role = $("role")?.value;
  const area = $("area")?.value?.trim();
  const email = $("email")?.value?.trim();
  const password = $("password")?.value;
  const confirm = $("confirmPassword")?.value;
  const msg = $("msg");

  if(!role || !area || !email || !password){
    if(msg) msg.textContent = "Please fill all fields";
    return;
  }
  if(password !== confirm){
    if(msg) msg.textContent = "Passwords do not match";
    return;
  }

  if(msg) msg.textContent = "Creating account...";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, area } }
  });

  if(error){
    if(msg) msg.textContent = error.message;
    return;
  }

  if(msg) msg.textContent = "Account created ✅ Now login";
  setTimeout(()=> window.location = "index.html", 1200);
};

window.signIn = async function(){
  const email = $("email")?.value?.trim();
  const password = $("password")?.value;
  const msg = $("msg");

  if(!email || !password){
    if(msg) msg.textContent = "Enter email and password";
    return;
  }

  if(msg) msg.textContent = "Logging in...";

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if(error){
    if(msg) msg.textContent = error.message;
    return;
  }

  // Read profile (role/area)
  const { data: profile, error: perr } = await supabase
    .from("profiles")
    .select("role, area")
    .eq("id", data.user.id)
    .single();

  if(perr || !profile){
    if(msg) msg.textContent = "Profile missing. Contact admin.";
    return;
  }

  localStorage.setItem("role", profile.role);
  localStorage.setItem("area", profile.area);

  window.location = "dashboard.html";
};

window.logout = async function(){
  try{ await supabase.auth.signOut(); }catch(e){}
  localStorage.clear();
  window.location = "index.html";
};

window.protectPage = async function(allowedRoles=[]){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user){
    window.location = "index.html";
    return;
  }

  const role = localStorage.getItem("role");
  if(allowedRoles.length > 0 && !allowedRoles.includes(role)){
    alert("Access denied for your role");
    window.location = "dashboard.html";
  }
};

window.applyRoleMenu = function(){
  const role = localStorage.getItem("role");

  document.querySelectorAll(".nav-admin").forEach(e=> e.style.display="none");
  document.querySelectorAll(".nav-worker").forEach(e=> e.style.display="none");

  if(role === "admin"){
    document.querySelectorAll(".nav-admin").forEach(e=> e.style.display="block");
  }

  if(role === "worker" || role === "driver" || role === "recycling_manager"){
    document.querySelectorAll(".nav-worker").forEach(e=> e.style.display="block");
  }
};

/* =========================
   PROFILE DROPDOWN + MODAL
========================= */
document.addEventListener("click", (e)=>{
  const btn = $("profileBtn");
  const dd = $("profileDropdown");
  if(!btn || !dd) return;

  if(btn.contains(e.target)){
    dd.style.display = (dd.style.display === "block") ? "none" : "block";
  }else{
    dd.style.display = "none";
  }
});

window.openProfile = async function(){
  const modal = $("profileModal");
  if(!modal) return;

  modal.style.display = "block";

  const { data: { user } } = await supabase.auth.getUser();
  if(!user) return;

  if($("profileEmail")) $("profileEmail").value = user.email || "";

  const { data: p } = await supabase
    .from("profiles")
    .select("role, area")
    .eq("id", user.id)
    .single();

  if($("profileRole")) $("profileRole").value = p?.role || "";
  if($("profileArea")) $("profileArea").value = p?.area || "";
};

window.closeProfile = function(){
  const modal = $("profileModal");
  if(modal) modal.style.display = "none";
};

window.changePassword = async function(){
  const np = $("newPassword")?.value || "";
  if(np.length < 6){
    toast("Password must be at least 6 characters");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: np });
  if(error) toast(error.message);
  else{
    toast("Password updated ✅");
    if($("newPassword")) $("newPassword").value = "";
    closeProfile();
  }
};

/* =========================
   CORE ERP: BINS → TASKS
========================= */
async function getMyProfile(){
  const { data: { user } } = await supabase.auth.getUser();
  if(!user) throw new Error("Not logged in");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, area")
    .eq("id", user.id)
    .single();

  if(error) throw new Error(error.message);
  return data;
}

async function createPickupTaskIfNeeded(binId, area){
  // Prevent duplicate OPEN task
  const { data: existing } = await supabase
    .from("pickup_tasks")
    .select("id")
    .eq("bin_id", binId)
    .eq("status", "OPEN")
    .limit(1);

  if(existing?.length) return;

  // Assign 1 worker + 1 driver from same area (demo-friendly)
  const { data: workers } = await supabase
    .from("profiles").select("id")
    .eq("role","worker").eq("area", area).limit(1);

  const { data: drivers } = await supabase
    .from("profiles").select("id")
    .eq("role","driver").eq("area", area).limit(1);

  const { error } = await supabase.from("pickup_tasks").insert([{
    bin_id: binId,
    area,
    assigned_worker_id: workers?.[0]?.id || null,
    assigned_driver_id: drivers?.[0]?.id || null,
    status: "OPEN"
  }]);

  if(error) throw new Error(error.message);
}

window.saveBin = async function(){
  try{
    const binId = $("binid")?.value?.trim();
    const area  = $("binarea")?.value?.trim();
    const status = $("status")?.value;

    if(!binId || !area){ toast("Enter Bin ID and Area"); return; }

    const me = await getMyProfile();

    // upsert by bin_id
    const { data: found } = await supabase
      .from("bins")
      .select("id")
      .eq("bin_id", binId)
      .limit(1);

    if(found?.length){
      const { error } = await supabase
        .from("bins")
        .update({
          area,
          status,
          updated_by: me.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", found[0].id);

      if(error) throw new Error(error.message);
    }else{
      const { error } = await supabase
        .from("bins")
        .insert([{ bin_id: binId, area, status, updated_by: me.id }]);

      if(error) throw new Error(error.message);
    }

    // Auto workflow
    if(status === "Full"){
      await createPickupTaskIfNeeded(binId, area);
      toast("Bin FULL → Task created ✅");
    }else{
      toast("Bin updated ✅");
    }

    if(window.renderBins) window.renderBins();
  }catch(e){
    toast("Error: " + e.message);
  }
};

window.renderBins = async function(){
  const tbody = $("binsBody");
  if(!tbody) return;

  const q = ($("searchBins")?.value || "").toLowerCase();

  const { data, error } = await supabase
    .from("bins")
    .select("bin_id, area, status, updated_at")
    .order("updated_at", { ascending:false });

  if(error){ tbody.innerHTML=""; toast(error.message); return; }

  const pill = (s)=> s==="Full" ? "bad" : (s==="Half" ? "warn" : "good");

  const list = (data || []).filter(x =>
    x.bin_id.toLowerCase().includes(q) ||
    x.area.toLowerCase().includes(q) ||
    x.status.toLowerCase().includes(q)
  );

  tbody.innerHTML = list.map(x=>`
    <tr>
      <td>${x.bin_id}</td>
      <td>${x.area}</td>
      <td><span class="pill ${pill(x.status)}">${x.status}</span></td>
      <td>${x.updated_at ? new Date(x.updated_at).toLocaleString() : ""}</td>
    </tr>
  `).join("");
};

/* =========================
   MY TASKS: Worker/Driver/Manager
========================= */
window.loadMyTasks = async function(){
  const tbody = $("tasksBody");
  if(!tbody) return;

  const { data: { user } } = await supabase.auth.getUser();
  const role = localStorage.getItem("role");

  let query = supabase
    .from("pickup_tasks")
    .select("*")
    .order("created_at",{ ascending:false });

  // worker & driver only see assigned tasks
  if(role === "worker" || role === "driver"){
    query = query.or(`assigned_worker_id.eq.${user.id},assigned_driver_id.eq.${user.id}`);
  }

  const { data, error } = await query;

  if(error){
    tbody.innerHTML = "";
    toast(error.message);
    return;
  }

  tbody.innerHTML = (data || []).map(t=>`
    <tr>
      <td>${t.bin_id}</td>
      <td>${t.area}</td>
      <td>${t.status}</td>
      <td>${taskActionButton(t, role)}</td>
    </tr>
  `).join("");
};

function taskActionButton(t, role){
  if(role==="worker" && t.status==="OPEN")
    return `<button class="btn" onclick="markCollected('${t.id}')">Mark Collected</button>`;
  if(role==="driver" && t.status==="COLLECTED")
    return `<button class="btn" onclick="markDelivered('${t.id}')">Mark Delivered</button>`;
  if(role==="recycling_manager" && t.status==="DELIVERED")
    return `<button class="btn" onclick="markRecycled('${t.id}')">Mark Recycled</button>`;
  return "-";
}

window.markCollected = async function(taskId){
  const kg = prompt("Collected kg?");
  if(!kg) return;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status:"COLLECTED",
      collected_at: new Date().toISOString(),
      collected_kg: kg
    })
    .eq("id", taskId);

  if(error) toast(error.message);
  else toast("Collected ✅");

  loadMyTasks();
};

window.markDelivered = async function(taskId){
  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status:"DELIVERED",
      delivered_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if(error) toast(error.message);
  else toast("Delivered ✅");

  loadMyTasks();
};

window.markRecycled = async function(taskId){
  const received = prompt("Received kg?");
  if(!received) return;

  const percent = prompt("Recycle %?");
  if(!percent) return;

  const { error } = await supabase
    .from("pickup_tasks")
    .update({
      status:"RECYCLED",
      received_kg: received,
      recycle_percent: percent,
      recycled_at: new Date().toISOString()
    })
    .eq("id", taskId);

  if(error) toast(error.message);
  else toast("Recycled ✅");

  loadMyTasks();
};

/* =========================
   USERS (Admin)
========================= */
let _usersCache = [];

window.loadUsers = async function(){
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, area, created_at")
    .order("created_at", { ascending:false });

  if(error){ toast("Load users failed: " + error.message); return; }
  _usersCache = data || [];
  window.renderUsers();
};

window.renderUsers = function(){
  const tbody = $("usersBody");
  if(!tbody) return;

  const q = ($("searchUsers")?.value || "").toLowerCase();

  const list = (_usersCache || []).filter(u =>
    (u.email || "").toLowerCase().includes(q) ||
    (u.role || "").toLowerCase().includes(q) ||
    (u.area || "").toLowerCase().includes(q)
  );

  tbody.innerHTML = list.map(u=>`
    <tr>
      <td>${u.email || ""}</td>
      <td>
        <select id="role_${u.id}">
          ${["admin","worker","driver","recycling_manager"].map(r =>
            `<option value="${r}" ${u.role===r?"selected":""}>${r}</option>`
          ).join("")}
        </select>
      </td>
      <td><input id="area_${u.id}" value="${u.area || ""}" /></td>
      <td><button type="button" class="btn" onclick="updateUser('${u.id}')">Save</button></td>
    </tr>
  `).join("");
};

window.updateUser = async function(userId){
  const role = $("role_" + userId)?.value;
  const area = $("area_" + userId)?.value?.trim();

  if(!area){ toast("Area required"); return; }

  const { error } = await supabase
    .from("profiles")
    .update({ role, area })
    .eq("id", userId);

  if(error){ toast("Update failed: " + error.message); return; }

  toast("User updated ✅");
  loadUsers();
};

window.initProfileMenu = function () {
  const btn = document.getElementById("profileBtn");
  const dd = document.getElementById("profileDropdown");
  if (!btn || !dd) return;

  btn.addEventListener("click", () => {
    dd.style.display = (dd.style.display === "block") ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target) && e.target !== btn) dd.style.display = "none";
  });
};

window.loadProfile = async function () {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location = "index.html";
      return;
    }

    // email from auth
    const emailEl = document.getElementById("profileEmail");
    if (emailEl) emailEl.value = user.email || "";

    // role+area from profiles table
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, area")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    document.getElementById("profileRole").value = profile?.role || "-";
    document.getElementById("profileArea").value = profile?.area || "-";
  } catch (e) {
    toast("Profile load failed: " + e.message);
  }
};

window.changePassword = async function () {
  const p1 = document.getElementById("newPassword")?.value || "";
  const p2 = document.getElementById("confirmNewPassword")?.value || "";
  const msg = document.getElementById("msg");

  if (!p1 || !p2) {
    if (msg) msg.textContent = "Enter both password fields";
    return;
  }
  if (p1 !== p2) {
    if (msg) msg.textContent = "Passwords do not match";
    return;
  }
  if (p1.length < 6) {
    if (msg) msg.textContent = "Password must be at least 6 characters";
    return;
  }

  if (msg) msg.textContent = "Updating...";

  const { error } = await supabase.auth.updateUser({ password: p1 });

  if (error) {
    if (msg) msg.textContent = error.message;
    return;
  }

  if (msg) msg.textContent = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmNewPassword").value = "";
  toast("Password updated ✅");
};

window.initProfileMenu = function () {
  const btn = document.getElementById("profileBtn");
  const dd = document.getElementById("profileDropdown");
  if (!btn || !dd) return;

  btn.addEventListener("click", () => {
    dd.style.display = (dd.style.display === "block") ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target) && e.target !== btn) dd.style.display = "none";
  });
};

// ---------- PROFILE MENU ----------
window.initProfileMenu = function () {

  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileDropdown");

  if (!btn || !menu) return;

  // open dropdown
  btn.onclick = () => {
    menu.style.display =
      menu.style.display === "block" ? "none" : "block";
  };

  // close when clicking outside
  document.addEventListener("click", (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = "none";
    }
  });
};
