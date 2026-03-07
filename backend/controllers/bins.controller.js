const supabase = require("../config/supabase");

exports.getBins = async (req, res) => {
  try {
    const { data: bins, error } = await supabase
      .from("bins")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }

    return res.json({
      ok: true,
      bins
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

exports.updateBin = async (req, res) => {
  try {
    const { bin_id, area, status } = req.body;

    const payload = {
      bin_id,
      area,
      status,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("bins")
      .upsert(payload, { onConflict: "bin_id" });

    if (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true, message: "Bin updated" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

exports.assignBinTask = async (req, res) => {
  try {
    const { binCode, assignedTo, priority, notes } = req.body;

    const payload = {
      bin_id: binCode,
      assigned_to: assignedTo,
      priority,
      notes,
      status: "ASSIGNED",
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("pickup_tasks")
      .insert(payload);

    if (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }

    return res.json({ ok: true, message: "Task assigned successfully" });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};