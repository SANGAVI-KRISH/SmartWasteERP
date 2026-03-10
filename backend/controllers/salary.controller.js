const PDFDocument = require("pdfkit");
const service = require("../services/salary.service");

exports.getMySalary = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });
    }

    const data = await service.getMySalary(req.user);

    return res.status(200).json({
      ok: true,
      data
    });
  } catch (err) {
    console.error("salary.getMySalary error:", err.message);

    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to fetch salary"
    });
  }
};

exports.getMySalaryHistory = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });
    }

    const filters = {
      month: req.query.month || "",
      year: req.query.year || "",
      status: req.query.status || ""
    };

    const data = await service.getMySalaryHistory(req.user, filters);

    return res.status(200).json({
      ok: true,
      data
    });
  } catch (err) {
    console.error("salary.getMySalaryHistory error:", err.message);

    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to fetch salary history"
    });
  }
};

exports.exportMySalaryPdf = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });
    }

    const filters = {
      month: req.query.month || "",
      year: req.query.year || "",
      status: req.query.status || ""
    };

    const result = await service.exportMySalaryPdf(req.user, filters);
    const { profile, rows, summary, filterText } = result;

    const doc = new PDFDocument({
      margin: 40,
      size: "A4"
    });

    const filename = `salary-history-${req.user.id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.fontSize(24).text("Salary History Report", { align: "left" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Name: ${profile.full_name || "-"}`);
    doc.text(`Email: ${profile.email || "-"}`);
    doc.text(`Role: ${profile.role || "-"}`);
    doc.text(`Area: ${profile.area || "-"}`);
    doc.text(`Filters: ${filterText}`);
    doc.text(`Generated At: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(14).text("Summary");
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Records: ${summary.totalRecords}`);
    doc.text(`Total Salary: ₹ ${summary.totalSalary.toFixed(2)}`);
    doc.moveDown();

    const startX = 40;
    let y = doc.y + 5;

    const col = {
      sn: 40,
      month: 90,
      year: 80,
      salary: 130,
      status: 100,
      paidAt: 160
    };

    function rowLine() {
      doc
        .moveTo(startX, y)
        .lineTo(555, y)
        .strokeColor("#cccccc")
        .stroke();
    }

    function drawRow(values, isHeader = false) {
      const height = 24;

      if (y > 740) {
        doc.addPage();
        y = 50;
      }

      const font = isHeader ? "Helvetica-Bold" : "Helvetica";
      doc.font(font).fontSize(11);

      let x = startX;

      doc.text(String(values[0] ?? ""), x, y, { width: col.sn });
      x += col.sn;

      doc.text(String(values[1] ?? ""), x, y, { width: col.month });
      x += col.month;

      doc.text(String(values[2] ?? ""), x, y, { width: col.year });
      x += col.year;

      doc.text(String(values[3] ?? ""), x, y, { width: col.salary });
      x += col.salary;

      doc.text(String(values[4] ?? ""), x, y, { width: col.status });
      x += col.status;

      doc.text(String(values[5] ?? ""), x, y, { width: col.paidAt });

      y += height;
      rowLine();
      y += 6;
    }

    drawRow(["#", "Month", "Year", "Total Salary (₹)", "Status", "Paid At"], true);

    if (!rows.length) {
      drawRow(["-", "No salary records found", "", "", "", ""]);
    } else {
      rows.forEach((row, index) => {
        drawRow([
          index + 1,
          row.month_name || "-",
          row.year || "-",
          Number(row.total_salary || 0).toFixed(2),
          row.status || "-",
          row.paid_at ? new Date(row.paid_at).toLocaleString() : "-"
        ]);
      });
    }

    doc.end();
  } catch (err) {
    console.error("salary.exportMySalaryPdf error:", err.message);

    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to export salary report"
    });
  }
};