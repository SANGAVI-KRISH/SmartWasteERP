import { apiGet, apiPost, apiDelete } from "./apiClient.js";

function $(id) {
  return document.getElementById(id);
}

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function normalizeDate(input) {
  const v = String(input || "").trim();

  if (!v) return todayISO();

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }

  return todayISO();
}

function toast(msg) {
  const t = $("toast");
  if (!t) return alert(msg);

  t.textContent = msg;
  t.style.display = "block";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 1700);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRecord(r) {
  return {
    id: r?.id ?? "",
    date: r?.date ?? r?.rdate ?? "",
    type: r?.type ?? r?.waste_type ?? "",
    input: r?.input ?? r?.input_kg ?? 0,
    recycled: r?.recycled ?? r?.recycled_kg ?? 0,
    landfill: r?.landfill ?? r?.landfill_kg ?? 0
  };
}

function resetRecycleForm() {
  const sel = $("collectedTaskSelect");
  const inputKg = $("input");
  const recycledKg = $("recycled");
  const landfillKg = $("landfill");
  const typeSel = $("rtype");
  const rdate = $("rdate");

  if (sel) sel.value = "";
  if (inputKg) inputKg.value = "";
  if (recycledKg) recycledKg.value = "";
  if (landfillKg) landfillKg.value = "";
  if (typeSel) typeSel.value = "Wet";
  if (rdate) rdate.value = todayISO();
}

function setCollectedHint(message = "") {
  const hint = $("collectedHint");
  if (!hint) return;

  hint.textContent = message;
  hint.style.display = message ? "block" : "none";
}

function setRecyclingHint(message = "") {
  const hint = $("recyclingHint");
  if (!hint) return;

  hint.textContent = message;
  hint.style.display = message ? "block" : "none";
}

function applySelectedSourceAutofill() {
  const sel = $("collectedTaskSelect");
  const inputKg = $("input");
  const typeSel = $("rtype");

  if (!sel || !inputKg || !typeSel) return;

  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) {
    inputKg.value = "";
    return;
  }

  const kg = parseFloat(opt.dataset.kg ?? "");
  inputKg.value = !Number.isNaN(kg) && kg >= 0 ? String(kg) : "";

  const wasteType = String(opt.dataset.type || "").trim();
  if (wasteType) {
    typeSel.value = wasteType;
  }
}

async function loadCollectedTasksForRecycling(keepSelection = true) {
  const sel = $("collectedTaskSelect");
  if (!sel) return;

  const prevValue = keepSelection ? sel.value : "";

  sel.innerHTML = `<option value="">-- Select Collection Record --</option>`;
  setCollectedHint("");

  try {
    const res = await apiGet("/api/recycling/available-sources");

    if (!res.ok) {
      setCollectedHint(res.message || "Failed to load collection records.");
      return;
    }

    const rows = Array.isArray(res.data) ? res.data : [];

    for (const item of rows) {
      const opt = document.createElement("option");
      opt.value = String(item.value || "");
      opt.textContent = item.label || item.value || "";
      opt.dataset.kg = String(item.kg ?? 0);
      opt.dataset.kind = String(item.kind || "");
      opt.dataset.type = String(item.waste_type || "");
      sel.appendChild(opt);
    }

    if (prevValue) {
      const exists = Array.from(sel.options).some((o) => o.value === prevValue);
      if (exists) sel.value = prevValue;
    }

    applySelectedSourceAutofill();

    if (sel.options.length <= 1) {
      setCollectedHint("No collection records found.");
    }
  } catch (err) {
    console.error("loadCollectedTasksForRecycling error:", err);
    setCollectedHint("Failed to load collection records.");
  }
}

function bindCollectedTaskAutofill() {
  const sel = $("collectedTaskSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    applySelectedSourceAutofill();
  });
}

async function saveRecycleAlways() {
  const date = normalizeDate($("rdate")?.value || todayISO());
  const type = String($("rtype")?.value || "").trim();
  const inputKg = num($("input")?.value);
  const recycledKg = num($("recycled")?.value);
  const landfillKg = num($("landfill")?.value);
  const raw = String($("collectedTaskSelect")?.value || "").trim();

  if (!raw) throw new Error("Please select a collection record.");
  if (!type) throw new Error("Please select waste type.");
  if (!(inputKg > 0)) throw new Error("Input (kg) must be greater than 0.");
  if (recycledKg < 0 || landfillKg < 0) {
    throw new Error("Kg values cannot be negative.");
  }
  if (recycledKg + landfillKg > inputKg) {
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

  return normalizeRecord(res.data || {});
}

async function deleteRecyclingRecord(id) {
  const res = await apiDelete(`/api/recycling/${id}`);

  if (!res.ok) {
    throw new Error(res.message || "Failed to delete recycling record");
  }

  return res.data;
}

function bindDeleteButtons() {
  document.querySelectorAll(".recycle-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id) {
        toast("Record id missing");
        return;
      }

      const ok = window.confirm("Delete this recycling record?");
      if (!ok) return;

      try {
        btn.disabled = true;
        btn.textContent = "Deleting...";

        await deleteRecyclingRecord(id);

        toast("✅ Recycling record deleted!");
        await loadCollectedTasksForRecycling(false);
        await renderRecyclingAlways();
      } catch (err) {
        console.error("deleteRecyclingRecord error:", err);
        toast(err?.message || "Delete failed");
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
  });
}

async function renderRecyclingAlways() {
  const body = $("recyclingBody");
  if (!body) return;

  body.innerHTML = "";
  setRecyclingHint("");

  try {
    const q = ($("searchRecycling")?.value || "").toLowerCase().trim();

    const params = new URLSearchParams();
    if (q) params.set("q", q);

    const qs = params.toString();
    const url = qs ? `/api/recycling?${qs}` : "/api/recycling";

    const res = await apiGet(url);

    if (!res.ok) {
      setRecyclingHint(res.message || "Could not read recycling records.");
      return;
    }

    const rows = Array.isArray(res.data)
      ? res.data.map(normalizeRecord)
      : [];

    if (!rows.length) {
      setRecyclingHint("No recycling records found.");
      return;
    }

    body.innerHTML = rows
      .map(
        (r) => `
          <tr>
            <td>${esc(r.date)}</td>
            <td>${esc(r.type)}</td>
            <td>${esc(r.input)}</td>
            <td>${esc(r.recycled)}</td>
            <td>${esc(r.landfill)}</td>
            <td>
              <button
                type="button"
                class="btn red recycle-delete-btn"
                data-id="${esc(r.id)}"
              >
                Delete
              </button>
            </td>
          </tr>
        `
      )
      .join("");

    bindDeleteButtons();
  } catch (err) {
    console.error("renderRecyclingAlways error:", err);
    setRecyclingHint("Could not read recycling records.");
  }
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
  if ($("rdate") && !$("rdate").value) {
    $("rdate").value = todayISO();
  }

  const onlyMineToggle = $("onlyMineToggle");
  if (onlyMineToggle) {
    onlyMineToggle.checked = false;
    onlyMineToggle.disabled = true;

    if (onlyMineToggle.parentElement) {
      onlyMineToggle.parentElement.style.opacity = "0.5";
      onlyMineToggle.parentElement.title = "Show only my records is disabled";
    }
  }

  bindCollectedTaskAutofill();

  await loadCollectedTasksForRecycling(false);
  await renderRecyclingAlways();

  $("saveRecycleBtn")?.addEventListener("click", async () => {
    const btn = $("saveRecycleBtn");

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
      }

      await saveRecycleAlways();

      toast("✅ Recycling entry saved!");
      resetRecycleForm();

      await loadCollectedTasksForRecycling(false);
      await renderRecyclingAlways();
    } catch (e) {
      console.error("saveRecycleAlways error:", e);
      toast(e?.message || "Save error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save Entry";
      }
    }
  });

  $("searchRecycling")?.addEventListener("input", async () => {
    await renderRecyclingAlways();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      await loadCollectedTasksForRecycling(true);
      await renderRecyclingAlways();
    }
  });

  $("logoutBtnTop")?.addEventListener("click", safeLogout);
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
});