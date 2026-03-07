import { apiGet, apiPost } from "./apiClient.js";

function $(id) { return document.getElementById(id); }

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function toast(msg) {
  const t = $("toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => (t.style.display = "none"), 1700);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const HIDE_KEY = "recycled_hidden_keys";

function getHiddenSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIDE_KEY) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function addHiddenKey(val) {
  const s = getHiddenSet();
  s.add(String(val));
  localStorage.setItem(HIDE_KEY, JSON.stringify(Array.from(s)));
}

function removeOptionByValue(val) {
  const sel = $("collectedTaskSelect");
  if (!sel || !val) return;

  const target = String(val);
  for (let i = sel.options.length - 1; i >= 1; i--) {
    if (sel.options[i].value === target) {
      sel.remove(i);
      break;
    }
  }

  sel.value = "";
  $("input").value = "";
  $("recycled").value = "";
  $("landfill").value = "";
}

async function loadCollectedTasksForRecycling() {
  const sel = $("collectedTaskSelect");
  const hint = $("collectedHint");
  if (!sel) return;

  sel.innerHTML = `<option value="">-- Select COLLECTED task / Manual Collection --</option>`;
  if (hint) hint.style.display = "none";

  const hidden = getHiddenSet();
  const res = await apiGet("/api/recycling/available-sources");

  if (!res.ok) {
    if (hint) {
      hint.textContent = res.message || "Failed to load collected tasks/manual collections.";
      hint.style.display = "block";
    }
    return;
  }

  const rows = res.data || [];

  for (const item of rows) {
    if (hidden.has(String(item.value))) continue;

    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    opt.dataset.kg = String(item.kg ?? 0);
    opt.dataset.kind = item.kind || "";
    sel.appendChild(opt);
  }

  const total = sel.options.length - 1;
  if (total === 0 && hint) {
    hint.textContent = "No COLLECTED tasks / Manual Collections found.";
    hint.style.display = "block";
  }
}

function bindCollectedTaskAutofill() {
  const sel = $("collectedTaskSelect");
  const input = $("input");
  if (!sel || !input) return;

  sel.addEventListener("change", () => {
    const opt = sel.options[sel.selectedIndex];
    const kg = parseFloat(opt?.dataset?.kg ?? "");
    input.value = (!Number.isNaN(kg) && kg >= 0) ? String(kg) : "";
  });
}

async function saveRecycleAlways(selectedValue) {
  const date = $("rdate")?.value || todayISO();
  const type = $("rtype")?.value || "";
  const inputKg = num($("input")?.value);
  const recycledKg = num($("recycled")?.value);
  const landfillKg = num($("landfill")?.value);

  const raw = selectedValue || $("collectedTaskSelect")?.value || "";

  if (!raw) throw new Error("Please select a COLLECTED task / Manual Collection.");
  if (!type) throw new Error("Please select waste type.");
  if (!(inputKg > 0)) throw new Error("Input (kg) must be greater than 0.");
  if (recycledKg < 0 || landfillKg < 0) throw new Error("Kg values cannot be negative.");
  if ((recycledKg + landfillKg) > inputKg) {
    throw new Error("Recycled + Landfill must not exceed Input.");
  }

  const res = await apiPost("/api/recycling", {
    date,
    waste_type: type,
    input_kg: inputKg,
    recycled_kg: recycledKg,
    landfill_kg: landfillKg,
    source_value: raw
  });

  if (!res.ok) {
    throw new Error(res.message || "Failed to save recycling record");
  }
}

async function renderRecyclingAlways() {
  const body = $("recyclingBody");
  const hint = $("recyclingHint");
  if (!body) return;

  if (hint) {
    hint.style.display = "none";
    hint.textContent = "";
  }

  const q = ($("searchRecycling")?.value || "").toLowerCase().trim();
  const onlyMine = !!$("onlyMineToggle")?.checked;

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (onlyMine) params.set("onlyMine", "true");

  const res = await apiGet(`/api/recycling?${params.toString()}`);

  if (!res.ok) {
    body.innerHTML = "";
    if (hint) {
      hint.textContent = res.message || "Could not read recycling records.";
      hint.style.display = "block";
    }
    return;
  }

  const rows = res.data || [];

  body.innerHTML = rows.length
    ? rows.map(r => `
      <tr>
        <td>${r.date ?? ""}</td>
        <td>${r.type ?? ""}</td>
        <td>${r.input ?? ""}</td>
        <td>${r.recycled ?? ""}</td>
        <td>${r.landfill ?? ""}</td>
      </tr>
    `).join("")
    : "";
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", async () => {
  if ($("rdate") && !$("rdate").value) $("rdate").value = todayISO();

  await loadCollectedTasksForRecycling();
  bindCollectedTaskAutofill();
  await renderRecyclingAlways();

  $("saveRecycleBtn")?.addEventListener("click", async () => {
    const btn = $("saveRecycleBtn");
    const sel = $("collectedTaskSelect");
    const selectedValue = sel?.value || "";

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
      }

      await saveRecycleAlways(selectedValue);

      addHiddenKey(selectedValue);
      removeOptionByValue(selectedValue);

      toast("✅ Recycling entry saved!");
      await renderRecyclingAlways();
    } catch (e) {
      console.error(e);
      toast(e?.message || "Save error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save Entry";
      }
    }
  });

  $("searchRecycling")?.addEventListener("input", renderRecyclingAlways);
  $("onlyMineToggle")?.addEventListener("change", renderRecyclingAlways);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      await loadCollectedTasksForRecycling();
    }
  });

  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
});