const tasksService = require("../services/tasks.service");

exports.getMyTasks = async (req, res) => {
  try {
    const data = await tasksService.getMyTasks(req.user, req.query);

    res.status(200).json({
      ok: true,
      data,
      message:
        "Tasks fetched successfully. Completed tasks are shown only for their completed date; incomplete tasks remain visible.",
    });
  } catch (err) {
    console.error("getMyTasks error:", err);
    res.status(500).json({
      ok: false,
      message: err.message || "Failed to fetch tasks",
    });
  }
};

exports.updatePickupTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "Status is required",
      });
    }

    const data = await tasksService.updatePickupTaskStatus(
      req.params.id,
      status,
      req.user
    );

    res.status(200).json({
      ok: true,
      data,
      message: "Pickup task updated successfully",
    });
  } catch (err) {
    console.error("updatePickupTaskStatus error:", err);
    res.status(400).json({
      ok: false,
      message: err.message || "Failed to update pickup task",
    });
  }
};

exports.updateTripTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        ok: false,
        message: "Status is required",
      });
    }

    const data = await tasksService.updateTripTaskStatus(
      req.params.id,
      status,
      req.user
    );

    res.status(200).json({
      ok: true,
      data,
      message: "Trip task updated successfully",
    });
  } catch (err) {
    console.error("updateTripTaskStatus error:", err);
    res.status(400).json({
      ok: false,
      message: err.message || "Failed to update trip task",
    });
  }
};