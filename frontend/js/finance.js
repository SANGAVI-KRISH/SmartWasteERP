import { apiGet, apiPost, apiDelete } from "./apiClient.js";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2
});

const MAX_VISIBLE_TXNS = 10;

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

function currentYear() {
  return new Date().getFullYear();
}

function fmtMoney(v) {
  return INR.format(Number(v || 0));
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  const n = Number(value || 0);
  if (n < 0) {
    el.style.color = "#dc3545";
  } else if (n > 0) {
    el.style.color = "#198754";
  } else {
    el.style.color = "";
  }
}

function val(id) {
  return String($(id)?.value || "").trim();
}

function numVal(id) {
  const n = Number($(id)?.value);
  return Number.isFinite(n) ? n : 0;
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

function toggleSalaryFields() {
  const category = val("expenseCategory").toLowerCase();
  const salaryFields = $("salaryFields");
  if (!salaryFields) return;

  salaryFields.style.display = category === "salary" ? "block" : "none";
}

function resetExpenseForm() {
  if ($("expenseDate")) $("expenseDate").value = todayStr();
  if ($("expenseCategory")) $("expenseCategory").value = "fuel";
  if ($("expenseAmount")) $("expenseAmount").value = "";
  if ($("expenseDescription")) $("expenseDescription").value = "";
  if ($("salaryStaff")) $("salaryStaff").value = "";
  if ($("salaryMonth")) $("salaryMonth").value = "";
  if ($("salaryYear")) $("salaryYear").value = currentYear();
  if ($("salaryTotalKg")) $("salaryTotalKg").value = "";
  if ($("salaryRate")) $("salaryRate").value = "";
  toggleSalaryFields();
}

function resetRateForm() {
  if ($("rateWasteType")) $("rateWasteType").value = "Wet";
  if ($("rateType")) $("rateType").value = "collection";
  if ($("ratePerKg")) $("ratePerKg").value = "";
}

function applyRoleVisibility(role) {
  role = String(role || "").toLowerCase();

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

  document.querySelectorAll(".nav-all").forEach((el) => {
    el.style.display = "";
  });
}

function getTxnTypeBadge(type) {
  const t = String(type || "").toLowerCase();

  if (t === "income") {
    return `<span style="padding:4px 10px;border-radius:999px;background:rgba(25,135,84,.15);color:#7ee2a8;font-weight:700;font-size:12px;">Income</span>`;
  }

  if (t === "expense") {
    return `<span style="padding:4px 10px;border-radius:999px;background:rgba(220,53,69,.15);color:#ff9aa5;font-weight:700;font-size:12px;">Expense</span>`;
  }

  return escapeHtml(type || "-");
}

function getSourceLabel(row) {
  const sourceTable = String(row.source_table || "").toLowerCase();
  const category = String(row.category || "").toLowerCase();
  const isAuto = Boolean(row.is_auto);

  if (sourceTable === "collection_records" || category === "collection") {
    return "Collection";
  }

  if (sourceTable === "recycling_records" || category === "recycling") {
    return "Recycling";
  }

  if (!isAuto && category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  return row.category || "-";
}

function getActionCell(row, forExport = false) {
  const typeText = String(row.type || "").toLowerCase();
  const isAuto = Boolean(row.is_auto);

  if (forExport) {
    if (isAuto) return "Auto";
    if (typeText === "expense" && !isAuto) return "Manual";
    return "-";
  }

  if (typeText === "expense" && !isAuto) {
    return `<button type="button" class="btn red delete-txn-btn" data-id="${escapeHtml(row.id || "")}">Delete</button>`;
  }

  if (isAuto) {
    return `<span style="opacity:.8;">Auto</span>`;
  }

  return `<span style="opacity:.7;">-</span>`;
}

function getErrorMessage(res, fallback) {
  return res?.error || res?.message || fallback;
}

function normalizeTxnDate(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTxnSortTime(row) {
  const candidates = [
    row?.created_at,
    row?.updated_at,
    row?.txn_date
  ];

  for (const value of candidates) {
    if (!value) continue;
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return t;
  }

  return 0;
}

function sortTransactionsLatest(rows) {
  return [...(rows || [])].sort((a, b) => getTxnSortTime(b) - getTxnSortTime(a));
}

function getLatestTransactions(rows) {
  return sortTransactionsLatest(rows).slice(0, MAX_VISIBLE_TXNS);
}

function getTransactionQueryString(useFilters = true) {
  const params = new URLSearchParams();

  if (useFilters) {
    const q = val("searchTransactions");
    const type = val("filterTxnType");
    const from = val("filterFromDate");
    const to = val("filterToDate");

    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildTransactionRowsHtml(rows, forExport = false) {
  return rows
    .map((r) => {
      const typeText = String(r.type || "").toLowerCase();
      const amountStyle =
        typeText === "expense"
          ? "color:#dc3545;font-weight:700;"
          : "color:#198754;font-weight:700;";

      const qty =
        r.quantity_kg === null || r.quantity_kg === undefined || r.quantity_kg === ""
          ? "-"
          : escapeHtml(r.quantity_kg);

      const rate =
        r.rate_per_kg === null || r.rate_per_kg === undefined || r.rate_per_kg === ""
          ? "-"
          : fmtMoney(r.rate_per_kg);

      const description = r.description || "-";
      const sourceLabel = getSourceLabel(r);
      const typeCell = forExport
        ? escapeHtml(String(r.type || "-").replace(/^./, (c) => c.toUpperCase()))
        : getTxnTypeBadge(r.type);
      const actionCell = getActionCell(r, forExport);

      return `
        <tr>
          <td>${escapeHtml(normalizeTxnDate(r.txn_date) || "-")}</td>
          <td>${typeCell}</td>
          <td>${escapeHtml(sourceLabel)}</td>
          <td>${escapeHtml(r.waste_type || "-")}</td>
          <td>${qty}</td>
          <td>${rate}</td>
          <td style="${amountStyle}">${fmtMoney(r.amount || 0)}</td>
          <td title="${escapeHtml(description)}">${escapeHtml(description)}</td>
          <td>${actionCell}</td>
        </tr>
      `;
    })
    .join("");
}

function buildExportHtml(rows) {
  return `
    <div style="padding:18px; font-family:Arial, sans-serif; color:#111; background:#fff;">
      <h2 style="margin:0 0 6px 0;">Smart Waste ERP - Finance Transactions</h2>
      <div style="font-size:12px; color:#555; margin-bottom:14px;">
        Exported on: ${escapeHtml(new Date().toLocaleString())}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Date</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Type</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Category</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Waste Type</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Qty (kg)</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Rate / Kg</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Amount</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Description</th>
            <th style="border:1px solid #999; padding:8px; text-align:left;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${buildTransactionRowsHtml(rows, true)}
        </tbody>
      </table>
    </div>
  `;
}

async function fetchTransactions(useFilters = true) {
  const qs = getTransactionQueryString(useFilters);
  const res = await apiGet(`/api/finance/transactions${qs}`);
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to load transactions"));
  return res.data || [];
}

async function loadProfile() {
  const res = await apiGet("/api/profile/me");
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to load profile"));

  const p = res.data || {};
  applyRoleVisibility(p.role || "");
  return p;
}

async function loadStaffOptions() {
  const res = await apiGet("/api/users?role=worker,driver,recycling_manager");
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to load staff list"));

  const rows = res.data || [];
  const sel = $("salaryStaff");
  if (!sel) return;

  sel.innerHTML =
    `<option value="">Select Staff</option>` +
    rows
      .map((u) => {
        const name = u.full_name || u.name || u.email || "Staff";
        const role = u.role || "";
        return `<option value="${escapeHtml(u.id)}">${escapeHtml(name)}${role ? ` - ${escapeHtml(role)}` : ""}</option>`;
      })
      .join("");
}

async function loadSummary() {
  const res = await apiGet("/api/finance/summary");
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to load finance summary"));

  const data = res.data || {};
  const income = Number(data.income || 0);
  const expense = Number(data.expense || 0);
  const profit = Number(data.profit || 0);

  setText("incomeCard", fmtMoney(income));
  setText("expenseCard", fmtMoney(expense));
  setText("profitCard", fmtMoney(profit));
  setProfitColor(profit);
}

async function loadRates() {
  const rateType = val("filterRateType");
  const wasteType = val("filterWasteType");

  const params = new URLSearchParams();
  if (rateType) params.set("rate_type", rateType);
  if (wasteType) params.set("waste_type", wasteType);

  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await apiGet(`/api/finance/rates${qs}`);
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to load rates"));

  const rows = res.data || [];
  const body = $("ratesBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="4" style="opacity:.8;">No rates found</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const createdAt = r.created_at
        ? new Date(r.created_at).toLocaleString()
        : "-";

      return `
        <tr>
          <td>${escapeHtml(r.waste_type || "-")}</td>
          <td>${escapeHtml(r.rate_type || "-")}</td>
          <td>${fmtMoney(r.rate_per_kg || 0)}</td>
          <td>${escapeHtml(createdAt)}</td>
        </tr>
      `;
    })
    .join("");
}

async function loadTransactions() {
  const allRows = await fetchTransactions(true);
  const rows = getLatestTransactions(allRows);
  const body = $("transactionsBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML =
      `<tr><td colspan="9" style="opacity:.8;">No finance transactions found</td></tr>`;
    return;
  }

  body.innerHTML = buildTransactionRowsHtml(rows, false);
  bindDeleteButtons();
}

async function saveExpense() {
  const txn_date = val("expenseDate");
  const category = val("expenseCategory").toLowerCase();
  const amount = Number(val("expenseAmount"));
  const description = val("expenseDescription");

  const staff_id = val("salaryStaff");
  const salary_month = val("salaryMonth");
  const salary_year = val("salaryYear");
  const total_kg = numVal("salaryTotalKg");
  const rate = numVal("salaryRate");

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

  if (category === "salary") {
    if (!staff_id) {
      showToast("Please select staff", false);
      return;
    }

    if (!salary_month) {
      showToast("Please select salary month", false);
      return;
    }

    if (!salary_year) {
      showToast("Please enter salary year", false);
      return;
    }

    if (Number(salary_year) < 2000 || Number(salary_year) > 2100) {
      showToast("Enter a valid salary year", false);
      return;
    }

    if (total_kg < 0) {
      showToast("Total kg cannot be negative", false);
      return;
    }

    if (rate < 0) {
      showToast("Rate cannot be negative", false);
      return;
    }
  }

  const payload = {
    txn_date,
    category,
    amount,
    description,
    staff_id: category === "salary" ? staff_id : null,
    salary_month: category === "salary" ? salary_month : null,
    salary_year: category === "salary" ? salary_year : null,
    total_kg: category === "salary" ? total_kg : 0,
    rate: category === "salary" ? rate : 0
  };

  const res = await apiPost("/api/finance/expense", payload);

  if (!res.ok) {
    throw new Error(getErrorMessage(res, "Failed to save expense"));
  }

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

  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to save rate"));

  showToast("Rate saved");
  resetRateForm();

  await Promise.all([loadRates(), loadSummary(), loadTransactions()]);
}

async function deleteTransaction(id) {
  if (!id) return;

  const ok = window.confirm("Delete this finance transaction?");
  if (!ok) return;

  const res = await apiDelete(`/api/finance/transactions/${id}`);
  if (!res.ok) throw new Error(getErrorMessage(res, "Failed to delete transaction"));

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

async function exportTransactionsPDF() {
  if (typeof window.html2pdf === "undefined") {
    showToast("PDF library not loaded", false);
    return;
  }

  const hasFilters =
    !!val("searchTransactions") ||
    !!val("filterTxnType") ||
    !!val("filterFromDate") ||
    !!val("filterToDate");

  const rows = hasFilters
    ? sortTransactionsLatest(await fetchTransactions(true))
    : sortTransactionsLatest(await fetchTransactions(false));

  if (!rows.length) {
    showToast("No transactions to export", false);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.style.background = "#ffffff";
  wrapper.innerHTML = buildExportHtml(rows);
  document.body.appendChild(wrapper);

  const opt = {
    margin: 0.35,
    filename: `finance-transactions-${todayStr()}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: "in", format: "a4", orientation: "landscape" },
    pagebreak: { mode: ["css", "legacy"] }
  };

  try {
    await window.html2pdf().set(opt).from(wrapper).save();
    showToast("PDF exported");
  } finally {
    wrapper.remove();
  }
}

function bindEvents() {
  $("logoutBtnSidebar")?.addEventListener("click", safeLogout);
  $("logoutBtnTop")?.addEventListener("click", safeLogout);

  $("expenseCategory")?.addEventListener("change", toggleSalaryFields);

  $("refreshSummaryBtn")?.addEventListener("click", async () => {
    try {
      await Promise.all([loadSummary(), loadTransactions()]);
      showToast("Summary refreshed");
    } catch (err) {
      console.error("refreshSummaryBtn error:", err);
      showToast(err?.message || "Failed to refresh summary", false);
    }
  });

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

  $("exportPdfBtn")?.addEventListener("click", async () => {
    try {
      await exportTransactionsPDF();
    } catch (err) {
      console.error("exportPdfBtn error:", err);
      showToast(err?.message || "Failed to export PDF", false);
    }
  });
}

async function init() {
  try {
    bindEvents();
    resetExpenseForm();
    resetRateForm();

    const profile = await loadProfile();
    const role = String(profile?.role || "").toLowerCase();

    if (role !== "admin") {
      showToast("Finance page is only for admin", false);
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 700);
      return;
    }

    await Promise.all([
      loadStaffOptions(),
      loadSummary(),
      loadRates(),
      loadTransactions()
    ]);

    toggleSalaryFields();
  } catch (err) {
    console.error("finance init error:", err);
    showToast(err?.message || "Failed to load finance page", false);
  }
}

window.addEventListener("DOMContentLoaded", init);