const tasksService = require("../services/tasks.service");

/* ---------------- GET MY TASKS ---------------- */

exports.getMyTasks = async (req, res) => {
  try {
    const data = await tasksService.getMyTasks(req.user, req.query);

    return res.status(200).json({
      ok: true,
      data,
      message:
        "Tasks fetched successfully. Completed tasks are shown only for their completed date; incomplete tasks remain visible."
    });

  } catch (err) {
    console.error("getMyTasks error:", err);

    return res.status(500).json({
      ok: false,
      message: err.message || "Failed to fetch tasks"
    });
  }
};


/* ---------------- UPDATE PICKUP TASK STATUS ---------------- */

exports.updatePickupTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "Status is required"
      });
    }

    const data = await tasksService.updatePickupTaskStatus(
      req.params.id,
      status,
      req.user
    );

    return res.status(200).json({
      ok: true,
      data,
      message: "Pickup task updated successfully"
    });

  } catch (err) {
    console.error("updatePickupTaskStatus error:", err);

    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to update pickup task"
    });
  }
};


/* ---------------- UPDATE TRIP / STAFF TASK STATUS ---------------- */

exports.updateTripTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "Status is required"
      });
    }

    const data = await tasksService.updateTripTaskStatus(
      req.params.id,
      status,
      req.user
    );

    return res.status(200).json({
      ok: true,
      data,
      message: "Trip task updated successfully"
    });

  } catch (err) {
    console.error("updateTripTaskStatus error:", err);

    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to update trip task"
    });
  }
};


/* ---------------- COMPLETE STAFF TASK + SAVE COLLECTION ---------------- */

exports.completeStaffTaskWithCollection = async (req, res) => {
  try {

    const taskId = req.params.id;
    const body = req.body || {};

    if (!taskId) {
      return res.status(400).json({
        ok: false,
        message: "Task ID is required"
      });
    }

    const data = await tasksService.completeStaffTaskWithCollection(
      taskId,
      body,
      req.user
    );

    return res.status(200).json({
      ok: true,
      data,
      message: "Collection saved and task completed successfully"
    });

  } catch (err) {
    console.error("completeStaffTaskWithCollection error:", err);

    return res.status(400).json({
      ok: false,
      message: err.message || "Failed to complete staff task"
    });
  }
};