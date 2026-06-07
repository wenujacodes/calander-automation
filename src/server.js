require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { fetchAndParseTimetable } = require("./services/sheetService");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Health check endpoint
 */
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Calendar automation server is running",
    version: "1.0.0",
  });
});

/**
 * Timetable endpoint: Returns parsed timetable events from the Excel sheet
 * GET /timetable
 *
 * Response format:
 * [
 *   {
 *     "title": "DBMS (Lec) 1",
 *     "date": "2026-02-27",
 *     "startTime": "09:00",
 *     "endTime": "11:00",
 *     "type": "lecture"
 *   }
 * ]
 *
 * Errors:
 * - 500: Failed to fetch or parse timetable
 */
app.get("/timetable", async (req, res) => {
  try {
    console.log("[Server] GET /timetable - Fetching timetable events");
    const events = await fetchAndParseTimetable();

    res.json({
      status: "success",
      count: events.length,
      data: events,
    });
  } catch (error) {
    console.error("[Server] /timetable endpoint error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch timetable",
      error: error.message,
    });
  }
});

/**
 * 404 handler for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Calendar automation server running on port ${PORT}`);
  console.log(`[Server] Available endpoints:`);
  console.log(`  GET  / - Health check`);
  console.log(`  GET  /timetable - Get parsed timetable events`);
});