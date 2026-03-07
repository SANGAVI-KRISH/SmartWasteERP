import { apiGet, apiPost, apiDelete } from "./apiClient.js";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2
});

function $(id) {
  return document.getElementById(id);
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoney(v) {
  return INR.format(Number(v || 0));
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, ok = true) {
  const t = $("toast");
  if (!t) {
    alert(msg);
    return;
  }

  t.textContent = msg;
  t.style.display = "block";
  t.style.borderColor = ok ? "" : "rgba(255,80,80,.55)";
  t.style.background = ok ? "" : "rgba(255,80,80,.12)";

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    t.style.display = "none";
  }, 2200);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function setProfitColor(value) {
  const el = $("profitCard");
  if (!el) return;
  el.style.color = Number(value) < 0 ? "#dc3545" : "#198754";
}

function val(id) {
  return String($(id)?.value || "").trim();
}

function safeLogout() {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("session");
    localStorage.removeItem("smartwaste_session");
    localStorage.removeItem("cloudcrafter_session");
  } catch {}
  window.location.href = "index.html";
}

function resetExpenseForm() {
  if ($("expenseDate")) $("expenseDate").value = todayStr();
  if ($("expenseCategory")) $("expenseCategory").value = "fuel";
  if ($("expenseAmount")) $("expenseAmount").value = "";
  if ($("expenseDescription")) $("expenseDescription").value = "";
}

function resetRateForm() {
  if ($("rateWasteType")) $("rateWasteType").value = "Wet";
  if ($("rateType")) $("rateType").value = "collection";
  if ($("ratePerKg")) $("ratePerKg").value = "";
}

function applyRoleVisibility(role) {
  role = String(role || "").toLowerCase();

  // hide everything first
  document.querySelectorAll(
    ".nav-admin, .nav-worker, .nav-driver, .nav-recycling"
  ).forEach((el) => {
    el.style.display = "none";
  });

  if (role === "admin") {
    document.querySelectorAll(
      ".nav-admin, .nav-worker, .nav-driver, .nav-recycling"
    ).forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "worker") {
    document.querySelectorAll(".nav-worker").forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "driver") {
    document.querySelectorAll(".nav-driver").forEach((el) => {
      el.style.display = "";
    });
  }

  if (role === "recycling_manager") {
    document.querySelectorAll(".nav-recycling").forEach((el) => {
      el.style.display = "";
    });
  }

  // always visible
  document.querySelectorAll(".nav-all").forEach((el) => {
    el.style.display = "";
  });
}

async function loadProfile() {
  const res = await apiGet("/api/profile/me");
  if (!res.ok) throw new Error(res.message || "Failed to load profile");

  const p = res.data || {};
  applyRoleVisibility(p.role || "");
  return p;
}

async function loadSummary() {
  const res = await apiGet("/api/finance/summary");
  if (!res.ok) throw new Error(res.message || "Failed to load finance summary");

  const data = res.data || {};
  setText("incomeCard", fmtMoney(data.income || 0));
  setText("expenseCard", fmtMoney(data.expense || 0));
  setText("profitCard", fmtMoney(data.profit || 0));
  setProfitColor(data.profit || 0);
}

async function loadRates() {
  const rateType = val("filterRateType");
  const wasteType = val("filterWasteType");

  const params = new URLSearchParams();
  if (rateType) params.set("rate_type", rateType);
  if (wasteType) params.set("waste_type", wasteType);

  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiGet(`/api/finance/rates${qs}`);
  if (!res.ok) throw new Error(res.message || "Failed to load rates");

  const rows = res.data || [];
  const body = $("ratesBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" style="opacity:.8;">No rates found</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.waste_type || "-")}</td>
      <td>${escapeHtml(r.rate_type || "-")}</td>
      <td>${fmtMoney(r.rate_per_kg || 0)}</td>
      <td>${escapeHtml(r.created_at ? new Date(r.created_at).toLocaleString() : "-")}</td>
    </tr>
  `).join("");
}

async function loadTransactions() {
  const q = val("searchTransactions");
  const type = val("filterTxnType");
  const from = val("filterFromDate");
  const to = val("filterToDate");

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type) params.set("type", type);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiGet(`/api/finance/transactions${qs}`);
  if (!res.ok) throw new Error(res.message || "Failed to load transactions");

  const rows = res.data || [];
  const body = $("transactionsBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" style="opacity:.8;">No finance transactions found</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r) => {
    const typeText = String(r.type || "").toLowerCase();
    const amountStyle =
      typeText === "expense"
        ? "color:#dc3545;font-weight:700;"
        : "color:#198754;font-weight:700;";

    const delBtn =
      typeText === "expense"
        ? `<button class="btn red delete-txn-btn" data-id="${r.id}">Delete</button>`
        : `<span style="opacity:.7;">Auto</span>`;

    return `
      <tr>
        <td>${escapeHtml(r.txn_date || "-")}</td>
        <td>${escapeHtml(r.type || "-")}</td>
        <td>${escapeHtml(r.category || "-")}</td>
        <td>${escapeHtml(r.waste_type || "-")}</td>
        <td>${escapeHtml(r.quantity_kg ?? "-")}</td>
        <td>${escapeHtml(r.rate_per_kg ?? "-")}</td>
        <td style="${amountStyle}">${fmtMoney(r.amount || 0)}</td>
        <td title="${escapeHtml(r.description || "")}">${escapeHtml(r.description || "-")}</td>
        <td>${delBtn}</td>
      </tr>
    `;
  }).join("");

  bindDeleteButtons();
}

async function saveExpense() {
  const txn_date = val("expenseDate");
  const category = val("expenseCategory");
  const amount = Number(val("expenseAmount"));
  const description = val("expenseDescription");

  if (!txn_date) {
    showToast("Please select expense date", false);
    return;
  }

  if (!category) {
    showToast("Please select category", false);
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Enter a valid amount", false);
    return;
  }

  const res = await apiPost("/api/finance/expense", {
    txn_date,
    category,
    amount,
    description
  });

  if (!res.ok) throw new Error(res.message || "Failed to save expense");

  showToast("Expense saved");
  resetExpenseForm();
  await Promise.all([loadSummary(), loadTransactions()]);
}

async function saveRate() {
  const waste_type = val("rateWasteType");
  const rate_type = val("rateType");
  const rate_per_kg = Number(val("ratePerKg"));

  if (!waste_type) {
    showToast("Please select waste type", false);
    return;
  }

  if (!rate_type) {
    showToast("Please select rate type", false);
    return;
  }

  if (!Number.isFinite(rate_per_kg) || rate_per_kg < 0) {
    showToast("Enter valid rate per kg", false);
    return;
  }

  const res = await apiPost("/api/finance/rates", {
    waste_type,
    rate_type,
    rate_per_kg
  });

  if (!res.ok) throw new Error(res.message || "Failed to save rate");

  showToast("Rate saved");
  resetRateForm();
  await loadRates();
}

async function deleteTransaction(id) {
  if (!id) return;

  const ok = window.confirm("Delete this finance transaction?");
  if (!ok) return;

  const res = await apiDelete(`/api/finance/transactions/${id}`);
  if (!res.ok) throw new Error(res.message || "Failed to delete transaction");

  showToast("Transaction deleted");
  await Promise.all([loadSummary(), loadTransactions()]);
}

function bindDeleteButtons() {
  document.querySelectorAll(".delete-txn-btn").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await deleteTransaction(btn.dataset.id);
      } catch (err) {
        console.error("deleteTransaction error:", err);
        showToast(err?.message || "Failed to delete transaction", false);
      }
    };
  });
}

function bindEvents() {
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);

  $("saveExpenseBtn")?.addEventListener("click", async () => {
    try {
      await saveExpense();
    } catch (err) {
      console.error("saveExpense error:", err);
      showToast(err?.message || "Failed to save expense", false);
    }
  });

  $("clearExpenseBtn")?.addEventListener("click", () => {
    resetExpenseForm();
    showToast("Expense form cleared");
  });

  $("saveRateBtn")?.addEventListener("click", async () => {
    try {
      await saveRate();
    } catch (err) {
      console.error("saveRate error:", err);
      showToast(err?.message || "Failed to save rate", false);
    }
  });

  $("loadRatesBtn")?.addEventListener("click", async () => {
    try {
      await loadRates();
      showToast("Rates refreshed");
    } catch (err) {
      console.error("loadRates error:", err);
      showToast(err?.message || "Failed to load rates", false);
    }
  });

  $("filterRatesBtn")?.addEventListener("click", async () => {
    try {
      await loadRates();
    } catch (err) {
      console.error("filterRates error:", err);
      showToast(err?.message || "Failed to filter rates", false);
    }
  });

  $("filterTxnBtn")?.addEventListener("click", async () => {
    try {
      await loadTransactions();
    } catch (err) {
      console.error("filterTxnBtn error:", err);
      showToast(err?.message || "Failed to filter transactions", false);
    }
  });

  $("refreshTxnBtn")?.addEventListener("click", async () => {
    try {
      if ($("searchTransactions")) $("searchTransactions").value = "";
      if ($("filterTxnType")) $("filterTxnType").value = "";
      if ($("filterFromDate")) $("filterFromDate").value = "";
      if ($("filterToDate")) $("filterToDate").value = "";

      await Promise.all([loadSummary(), loadTransactions()]);
      showToast("Transactions refreshed");
    } catch (err) {
      console.error("refreshTxnBtn error:", err);
      showToast(err?.message || "Failed to refresh transactions", false);
    }
  });

  $("searchTransactions")?.addEventListener("input", async () => {
    try {
      await loadTransactions();
    } catch (err) {
      console.error("searchTransactions error:", err);
    }
  });
}

async function init() {
  try {
    bindEvents();
    resetExpenseForm();
    resetRateForm();

    const profile = await loadProfile();

    if (String(profile?.role || "").toLowerCase() !== "admin") {
      showToast("Finance page is only for admin", false);
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 700);
      return;
    }

    await Promise.all([
      loadSummary(),
      loadRates(),
      loadTransactions()
    ]);
  } catch (err) {
    console.error("finance init error:", err);
    showToast(err?.message || "Failed to load finance page", false);
  }
}

window.addEventListener("DOMContentLoaded", init);