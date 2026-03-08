const reportService = require("../services/report.service");

exports.getReportSummary = async (req, res) => {
  try {
    const data = await reportService.getReportSummary();

    return res.status(200).json({
      ok: true,
      data
    });
  } catch (err) {
    console.error("getReportSummary error:", err);

    return res.status(500).json({
      ok: false,
      message: err?.message || "Failed to generate report summary"
    });
  }
};

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

exports.exportReportCSV = async (req, res) => {
  try {
    const data = await reportService.getReportSummary();

    const rows = [];
    rows.push(["KPI", "Value"]);
    rows.push(["Total Collected", `${Math.round(Number(data.totalCollected) || 0)} kg`]);
    rows.push(["Total Recycled", `${Math.round(Number(data.totalRecycled) || 0)} kg`]);
    rows.push(["Sent to Landfill", `${Math.round(Number(data.totalLandfill) || 0)} kg`]);
    rows.push(["Full Bins", String(data.fullBins || 0)]);
    rows.push(["Collection Records", String(data.collectionCount || 0)]);
    rows.push(["Recycling Records", String(data.recyclingCount || 0)]);
    rows.push([]);

    rows.push(["Waste Type", "Total Collected (kg)"]);
    const typeTotals = data.typeTotals || {};
    const entries = Object.entries(typeTotals);

    if (entries.length) {
      for (const [type, val] of entries) {
        rows.push([String(type).toUpperCase(), String(Math.round(Number(val) || 0))]);
      }
    } else {
      rows.push(["(no data)", ""]);
    }

    rows.push([]);
    rows.push(["Insight", data.insight || ""]);

    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=smart_waste_report.csv");

    return res.status(200).send(csv);
  } catch (err) {
    console.error("exportReportCSV error:", err);

    return res.status(500).json({
      ok: false,
      message: err?.message || "Failed to export report"
    });
  }
};