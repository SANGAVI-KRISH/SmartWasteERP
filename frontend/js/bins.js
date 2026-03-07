const BINS_TABLE = "bins";
const PICKUP_TASKS_TABLE = "pickup_tasks";
const PROFILES_TABLE = "profiles";

const REMOVE_IF_TASK_STATUS_IN = new Set(["COLLECTED", "RECYCLED"]);
const HIDE_EMPTY_BINS = false; // keep false so rows do not disappear unexpectedly
const OV_KEY = "bin_task_status_override_v5";

let PINNED_BIN_ID = null;

function $(id) {
  return document.getElementById(id);
}

function norm(v) {
  return String(v || "").trim().toUpperCase();
}

function showToast(msg) {
  const t = $("toast");
  if (!t) {
    alert(msg);
    return;
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function getSupabase() {
  if (window.supabase) return window.supabase;

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (window.supabase) return window.supabase;
  }

  throw new Error("Supabase client not found. Check app.js");
}

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OV_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOverrides(obj) {
  localStorage.setItem(OV_KEY, JSON.stringify(obj || {}));
}

function setOverride(binCode, status) {
  const o = loadOverrides();
  o[norm(binCode)] = norm(status);
  saveOverrides(o);
}

function clearOverride(binCode) {
  const o = loadOverrides();
  delete o[norm(binCode)];
  saveOverrides(o);
}

function getOverride(binCode) {
  const o = loadOverrides();
  return norm(o[norm(binCode)] || "");
}

function toMs(dtLike) {
  const d = dtLike ? new Date(dtLike) : null;
  const ms = d && !isNaN(d) ? d.getTime() : 0;
  return ms || 0;
}

function normalizeTaskStatusForUI(statusRaw) {
  const s = norm(statusRaw);
  if (!s) return "";
  if (s === "OPEN") return "ASSIGNED";
  if (s === "ASSIGNED") return "ASSIGNED";
  if (s === "DELIVERED" || s === "RECEIVED" || s === "STARTED") return "STARTED";
  if (s === "COLLECTED") return "COLLECTED";
  if (s === "RECYCLED") return "RECYCLED";
  return s;
}

function isTaskStillBlockingAssign(binLastUpdated, taskObjOrNull, overrideStatus) {
  const binTs = toMs(binLastUpdated);
  const dbTs = taskObjOrNull?.ts || 0;
  const dbStatusUI = normalizeTaskStatusForUI(taskObjOrNull?.status || "");
  const ovStatusUI = normalizeTaskStatusForUI(overrideStatus || "");

  const taskIsStaleVsBinUpdate = binTs && dbTs && binTs > dbTs;
  const effective = ovStatusUI || dbStatusUI;
  const active = !!effective && !REMOVE_IF_TASK_STATUS_IN.has(effective);

  if (taskIsStaleVsBinUpdate && !ovStatusUI) return false;
  return active;
}

async function getMyProfileSafe() {
  const sb = await getSupabase();

  const { data: authData, error: authErr } = await sb.auth.getUser();
  if (authErr || !authData?.user) return null;

  const authUser = authData.user;

  const { data: profile, error: pErr } = await sb
    .from(PROFILES_TABLE)
    .select("id, full_name, email, role, area")
    .eq("id", authUser.id)
    .maybeSingle();

  if (pErr) {
    console.warn("Profile fetch failed:", pErr.message);
    return {
      id: authUser.id,
      email: authUser.email,
      role: ""
    };
  }

  return {
    id: profile?.id || authUser.id,
    full_name: profile?.full_name || "",
    email: profile?.email || authUser.email || "",
    role: String(profile?.role || "").toLowerCase()
  };
}

async function fetchBinsAll() {
  const sb = await getSupabase();

  const { data, error } = await sb
    .from(BINS_TABLE)
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("fetchBinsAll error:", error);
    showToast(error.message || "Failed to load bins");
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function fetchLatestTaskStatusByBinCode() {
  const sb = await getSupabase();

  const { data, error } = await sb
    .from(PICKUP_TASKS_TABLE)
    .select("bin_id,status,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("fetchLatestTaskStatusByBinCode error:", error.message);
    return new Map();
  }

  const map = new Map();

  for (const r of data || []) {
    const code = norm(r?.bin_id);
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, {
        status: norm(r?.status),
        ts: toMs(r?.updated_at || r?.created_at)
      });
    }
  }

  return map;
}

function ensurePinnedRowFirst(rows) {
  if (!PINNED_BIN_ID) return rows;

  const id = norm(PINNED_BIN_ID);
  const idx = rows.findIndex((r) => norm(r.binCode) === id);

  if (idx >= 0) {
    const [hit] = rows.splice(idx, 1);
    rows.unshift(hit);
  }

  return rows;
}

function updateRowActionToAssigned(binCode) {
  const actionCell = document.querySelector(`[data-action-cell="${binCode}"]`);
  const statusCell = document.querySelector(`[data-status-cell="${binCode}"]`);

  if (actionCell) {
    actionCell.innerHTML = `
      <button type="button" class="btn" disabled style="opacity:.75; cursor:not-allowed;">
        ASSIGNED
      </button>
    `;
  }

  if (statusCell) {
    statusCell.innerHTML = `<span class="badge amber">ASSIGNED</span>`;
  }
}

async function loadAssignableStaff() {
  const sb = await getSupabase();
  const select = $("assignBinTo");
  if (!select) return;

  select.innerHTML = `<option value="">Loading...</option>`;

  const { data, error } = await sb
    .from(PROFILES_TABLE)
    .select("id, full_name, email, role")
    .in("role", ["worker", "driver"])
    .order("full_name", { ascending: true });

  if (error) {
    console.error("loadAssignableStaff error:", error);
    select.innerHTML = `<option value="">No staff available</option>`;
    return;
  }

  const staff = Array.isArray(data) ? data : [];

  if (!staff.length) {
    select.innerHTML = `<option value="">No staff available</option>`;
    return;
  }

  select.innerHTML = `<option value="">Select worker / driver</option>`;

  staff.forEach((s) => {
    const option = document.createElement("option");
    option.value = s.id;
    option.dataset.role = s.role || "";
    option.textContent = `${s.full_name || s.email || "Staff"} (${s.role || "staff"})`;
    select.appendChild(option);
  });
}

async function safeInsertPickupTask(payload) {
  const sb = await getSupabase();

  const tryPayloads = [
    payload,
    {
      bin_id: payload.bin_id,
      area: payload.area,
      status: payload.status,
      assigned_worker_id: payload.assigned_worker_id || null,
      assigned_driver_id: payload.assigned_driver_id || null
    },
    {
      bin_id: payload.bin_id,
      area: payload.area,
      status: payload.status
    }
  ];

  let lastError = null;

  for (const p of tryPayloads) {
    const { error } = await sb.from(PICKUP_TASKS_TABLE).insert(p);
    if (!error) return { ok: true };
    lastError = error;
  }

  return { ok: false, error: lastError };
}

async function renderBins() {
  const body = $("binsBody");
  if (!body) return;

  const q = ($("searchBins")?.value || "").toLowerCase().trim();

  try {
    const [binsRaw, taskMap, me] = await Promise.all([
      fetchBinsAll(),
      fetchLatestTaskStatusByBinCode(),
      getMyProfileSafe()
    ]);

    const isAdmin = me?.role === "admin";
    const adminHint = $("adminAssignHint");
    if (adminHint) adminHint.style.display = isAdmin ? "block" : "none";

    let rows = (binsRaw || []).map((r) => ({
      binCode: String(r.bin_id || ""),
      area: String(r.area || ""),
      status: String(r.status || ""),
      lastUpdated: r.updated_at || r.last_updated || r.created_at || null
    }));

    if (HIDE_EMPTY_BINS) {
      rows = rows.filter((r) => String(r.status || "").toLowerCase() !== "empty");
    }

    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.binCode || "").toLowerCase().includes(q) ||
          String(r.area || "").toLowerCase().includes(q) ||
          String(r.status || "").toLowerCase().includes(q)
      );
    }

    rows = ensurePinnedRowFirst(rows);

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" style="opacity:.8;">No bins to show</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((r) => {
        const code = norm(r.binCode);
        const t = taskMap.get(code);
        const overrideStatus = getOverride(code);
        const taskStatusUI = normalizeTaskStatusForUI(overrideStatus || t?.status || "");

        const taskBlocksAssign = isTaskStillBlockingAssign(
          r.lastUpdated,
          t,
          overrideStatus
        );

        const displayStatus =
          taskBlocksAssign && taskStatusUI
            ? taskStatusUI
            : r.status || "-";

        const st = String(displayStatus).toLowerCase();
        const badge =
          st === "full"
            ? "badge red"
            : st === "half"
            ? "badge amber"
            : st === "assigned" || st === "started"
            ? "badge amber"
            : "badge";

        const dt = r.lastUpdated ? new Date(r.lastUpdated) : null;
        const when = dt && !isNaN(dt) ? dt.toLocaleString() : "-";

        let actionHtml = `<span style="opacity:.7;">-</span>`;

        if (isAdmin) {
          if (taskBlocksAssign) {
            actionHtml = `
              <button type="button" class="btn" disabled style="opacity:.75; cursor:not-allowed;">
                ${taskStatusUI || "ASSIGNED"}
              </button>
            `;
          } else {
            actionHtml = `
              <button
                type="button"
                class="btn assign-btn"
                data-bin="${r.binCode}"
                data-area="${r.area || ""}"
              >
                Assign
              </button>
            `;
          }
        }

        return `
          <tr data-bin-row="${r.binCode}">
            <td>${r.binCode}</td>
            <td>${r.area || "-"}</td>
            <td data-status-cell="${r.binCode}"><span class="${badge}">${displayStatus}</span></td>
            <td>${when}</td>
            <td data-action-cell="${r.binCode}">${actionHtml}</td>
          </tr>
        `;
      })
      .join("");

    document.querySelectorAll(".assign-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openAssignBinModal(btn.dataset.bin, btn.dataset.area || "");
      });
    });
  } catch (err) {
    console.error("renderBins error:", err);
    body.innerHTML = `<tr><td colspan="5" style="opacity:.8;">Failed to load bins</td></tr>`;
    showToast(err?.message || "Failed to load bins");
  }
}

function openAssignBinModal(binCode, area = "") {
  $("assignBinId").value = binCode || "";
  $("assignBinArea").value = area || "";
  $("assignBinPriority").value = "normal";
  $("assignBinNotes").value = "";
  $("assignBinModal").style.display = "flex";
  loadAssignableStaff();
}

function closeAssignBinModal() {
  $("assignBinModal").style.display = "none";
}

async function saveBin() {
  const sb = await getSupabase();

  const bin_id = $("binid")?.value?.trim();
  const area = $("binarea")?.value?.trim();
  const status = $("status")?.value?.trim();

  if (!bin_id) return showToast("Enter Bin ID");
  if (!area) return showToast("Enter Area");
  if (!status) return showToast("Select Status");

  const btn = $("btnUpdateBin");

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Updating...";
    }

    const payload = {
      bin_id,
      area,
      status,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from(BINS_TABLE)
      .upsert(payload, { onConflict: "bin_id" });

    if (error) {
      console.error("saveBin error:", error);
      showToast(error.message || "Failed to update bin");
      return;
    }

    clearOverride(bin_id);
    PINNED_BIN_ID = bin_id;

    showToast("Bin updated");
    await renderBins();
  } catch (err) {
    console.error("saveBin exception:", err);
    showToast(err?.message || "Failed to update bin");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Update Status";
    }
  }
}

async function confirmAssignBin(e) {
  if (e) e.preventDefault();

  const binCode = $("assignBinId")?.value?.trim();
  const area = $("assignBinArea")?.value?.trim() || "";
  const assignedTo = $("assignBinTo")?.value?.trim();
  const priority = $("assignBinPriority")?.value?.trim() || "normal";
  const notes = $("assignBinNotes")?.value?.trim() || "";

  if (!binCode) return showToast("Bin ID missing");
  if (!assignedTo) return showToast("Please select worker/driver");

  const selectedOption = $("assignBinTo")?.selectedOptions?.[0];
  const selectedRole = String(selectedOption?.dataset?.role || "").toLowerCase();

  const btn = $("btnAssignBinConfirm");

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Assigning...";
    }

    const payload = {
      bin_id: binCode,
      area,
      status: "OPEN",
      priority,
      notes
    };

    if (selectedRole === "worker") {
      payload.assigned_worker_id = assignedTo;
    } else if (selectedRole === "driver") {
      payload.assigned_driver_id = assignedTo;
    } else {
      payload.assigned_worker_id = assignedTo;
    }

    const result = await safeInsertPickupTask(payload);

    if (!result.ok) {
      console.error("assign error:", result.error);
      showToast(result.error?.message || "Failed to assign task");
      return;
    }

    setOverride(binCode, "ASSIGNED");
    updateRowActionToAssigned(binCode);
    closeAssignBinModal();
    showToast("Bin assigned successfully");

    setTimeout(() => {
      renderBins();
    }, 150);
  } catch (err) {
    console.error("confirmAssignBin exception:", err);
    showToast(err?.message || "Failed to assign task");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Assign";
    }
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const me = await getMyProfileSafe();

    if (!me) {
      showToast("Please login first");
      return;
    }

    const adminHint = $("adminAssignHint");
    if (adminHint) adminHint.style.display = me.role === "admin" ? "block" : "none";

    $("btnUpdateBin")?.addEventListener("click", saveBin);
    $("searchBins")?.addEventListener("input", renderBins);
    $("btnAssignBinCancel")?.addEventListener("click", closeAssignBinModal);
    $("assignBinForm")?.addEventListener("submit", confirmAssignBin);

    $("logoutBtnTop")?.addEventListener("click", () => {
      if (window.logout) return window.logout();
      localStorage.removeItem("token");
      window.location.href = "index.html";
    });

    $("logoutBtnSidebar")?.addEventListener("click", () => {
      if (window.logout) return window.logout();
      localStorage.removeItem("token");
      window.location.href = "index.html";
    });

    await renderBins();
  } catch (err) {
    console.error("DOMContentLoaded error:", err);
    showToast(err?.message || "Failed to initialize bins page");
  }
});