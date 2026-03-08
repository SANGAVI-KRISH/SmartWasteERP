const service = require("../services/collection.service");

function getStatusCode(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");

  // Supabase/Postgres unique violation
  if (code === "23505") return 400;

  // Friendly duplicate messages from service
  if (
    msg.includes("already recorded") ||
    msg.includes("duplicate") ||
    msg.includes("already exists")
  ) {
    return 400;
  }

  // Not found
  if (msg.includes("not found")) return 404;

  // Forbidden / unauthorized
  if (msg.includes("forbidden")) return 403;
  if (msg.includes("unauthorized")) return 401;

  return 500;
}

function getErrorMessage(err) {
  const msg = String(err?.message || "");

  if (String(err?.code || "") === "23505") {
    return "Collection already recorded for this task";
  }

  return msg || "Something went wrong";
}

exports.getCollections = async (req, res) => {
  try {
    const result = await service.getCollections(req.query);
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("getCollections error:", err);
    res
      .status(getStatusCode(err))
      .json({ ok: false, message: getErrorMessage(err) });
  }
};

exports.getTaskPrefill = async (req, res) => {
  try {
    const result = await service.getTaskPrefill(req.query.task_id);
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("getTaskPrefill error:", err);
    res
      .status(getStatusCode(err))
      .json({ ok: false, message: getErrorMessage(err) });
  }
};

exports.getStaffTaskPrefill = async (req, res) => {
  try {
    const result = await service.getStaffTaskPrefill(req.query.staff_task_id);
    res.json({ ok: true, data: result });
  } catch (err) {
    console.error("getStaffTaskPrefill error:", err);
    res
      .status(getStatusCode(err))
      .json({ ok: false, message: getErrorMessage(err) });
  }
};

exports.createCollection = async (req, res) => {
  try {
    const result = await service.createCollection(req.body, req.user || null);
    res.json({ ok: true, data: result, message: "Collection saved" });
  } catch (err) {
    console.error("createCollection error:", err);
    res
      .status(getStatusCode(err))
      .json({ ok: false, message: getErrorMessage(err) });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const result = await service.deleteCollection(req.params.id, req.user || null);
    res.json({ ok: true, data: result, message: "Deleted successfully" });
  } catch (err) {
    console.error("deleteCollection error:", err);
    res
      .status(getStatusCode(err))
      .json({ ok: false, message: getErrorMessage(err) });
  }
};