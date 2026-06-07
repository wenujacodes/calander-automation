require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { fetchAndParseTimetable } = require("./services/sheetService");
const { initializeDatabase } = require("./db/init");
const { saveTimetableEvents, getDatabaseStats } = require("./db/service");

// Initialize database on startup
initializeDatabase();

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
 * [TEMP] Sync timetable to database
 * Fetches latest timetable and saves to SQLite
 * Detects if content is unchanged (skips if same)
 * GET /timetable/sync
 *
 * Response:
 * {
 *   "success": true,
 *   "saved": true,
 *   "insertedCount": 5,
 *   "updatedCount": 2,
 *   "totalEvents": 110,
 *   "message": "Timetable synced to database"
 * }
 */
app.get("/timetable/sync", async (req, res) => {
  try {
    console.log("[Server] GET /timetable/sync - Syncing to database");

    // Fetch latest timetable
    const events = await fetchAndParseTimetable();

    // Save to database
    const saveResult = saveTimetableEvents(events, "sync");

    res.json({
      success: true,
      ...saveResult,
      message: saveResult.saved
        ? "Timetable synced to database"
        : "Timetable already up-to-date",
    });
  } catch (error) {
    console.error("[Server] /timetable/sync error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get database statistics and metadata
 * Shows event counts, types, and version history
 * GET /timetable/stats
 *
 * Response:
 * {
 *   "totalEvents": 110,
 *   "eventTypes": { "lecture": 70, "lab": 15, ... },
 *   "latestVersion": { "hash": "abc123...", "fetchedAt": "..." },
 *   "totalVersions": 3
 * }
 */
app.get("/timetable/stats", (req, res) => {
  try {
    console.log("[Server] GET /timetable/stats - Fetching database stats");
    const stats = getDatabaseStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[Server] /timetable/stats error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * [TEMP] Preview endpoint for debugging timetable parsing
 * Returns summary statistics, event type counts, and first 20 events
 * Validates event completeness and detects issues
 * GET /timetable/preview
 *
 * Response format:
 * {
 *   "totalEvents": 110,
 *   "eventTypes": { "lecture": 70, "lab": 15, ... },
 *   "sortingValid": true,
 *   "duplicatesDetected": 0,
 *   "sampleEvents": [...first 20 events...],
 *   "validationWarnings": [...]
 * }
 */
app.get("/timetable/preview", async (req, res) => {
  try {
    console.log("[Server] GET /timetable/preview - Debug preview");
    const events = await fetchAndParseTimetable();

    // Event type summary
    const eventTypeSummary = {};
    events.forEach((event) => {
      eventTypeSummary[event.type] = (eventTypeSummary[event.type] || 0) + 1;
    });

    // Validate sorting (should be sorted by date and startTime)
    let sortingValid = true;
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      const dateCompare = prev.date.localeCompare(curr.date);
      if (dateCompare > 0 || (dateCompare === 0 && prev.startTime > curr.startTime)) {
        sortingValid = false;
        console.warn(
          `[Debug] Sorting issue: "${prev.title}" (${prev.date} ${prev.startTime}) comes after "${curr.title}" (${curr.date} ${curr.startTime})`
        );
      }
    }

    // Detect duplicate events (same title, date, and time)
    const eventSignatures = new Set();
    const duplicates = [];
    events.forEach((event) => {
      const signature = `${event.title}|${event.date}|${event.startTime}|${event.endTime}`;
      if (eventSignatures.has(signature)) {
        duplicates.push({
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
        });
      }
      eventSignatures.add(signature);
    });

    // Validation warnings for incomplete events
    const validationWarnings = [];
    events.forEach((event, index) => {
      const issues = [];
      if (!event.title || !event.title.trim()) issues.push("missing title");
      if (!event.date) issues.push("missing date");
      if (!event.startTime) issues.push("missing start time");
      if (!event.endTime) issues.push("missing end time");

      if (issues.length > 0) {
        const warning = {
          eventIndex: index,
          issues,
          event: event,
        };
        validationWarnings.push(warning);
        console.warn(
          `[Debug] Event #${index} has issues: ${issues.join(", ")}`,
          event
        );
      }
    });

    // Get first 20 events
    const sampleEvents = events.slice(0, 20);

    const preview = {
      totalEvents: events.length,
      eventTypes: eventTypeSummary,
      sortingValid,
      duplicatesDetected: duplicates.length,
      sampleEvents,
    };

    // Add warnings and duplicates only if they exist
    if (duplicates.length > 0) {
      preview.duplicates = duplicates;
    }
    if (validationWarnings.length > 0) {
      preview.validationWarnings = validationWarnings;
    }

    res.json(preview);
  } catch (error) {
    console.error("[Server] /timetable/preview endpoint error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to preview timetable",
      error: error.message,
    });
  }
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
  console.log(`  GET  /timetable/preview - [TEMP] Debug preview with validation`);
  console.log(`  GET  /timetable/sync - [TEMP] Sync timetable to database`);
  console.log(`  GET  /timetable/stats - Get database statistics`);
});