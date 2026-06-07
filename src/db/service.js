const crypto = require("crypto");
const { getDatabase } = require("./init");

/**
 * Generate unique event ID based on event properties
 * Used to track events across timetable updates
 * @param {object} event - Event object with title, date, startTime
 * @returns {string} Unique event ID
 */
function generateEventId(event) {
  const str = `${event.title}|${event.date}|${event.startTime}`;
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Generate version hash for timetable snapshot
 * Used to detect if timetable content changed
 * @param {array} events - Array of events
 * @returns {string} Hash of all event IDs concatenated
 */
function generateVersionHash(events) {
  const eventIds = events
    .map((e) => generateEventId(e))
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(eventIds).digest("hex");
}

/**
 * Save parsed events to database
 * Upserts events (insert or update based on event_id)
 * @param {array} events - Array of parsed event objects
 * @param {string} source - Data source (local or sharepoint)
 * @returns {object} Metadata about save operation
 */
function saveTimetableEvents(events, source = "local") {
  const db = getDatabase();
  const startTime = Date.now();

  try {
    const eventIds = events.map(generateEventId);
    const versionHash = generateVersionHash(events);

    // Check if this version already exists
    const existingVersion = db
      .prepare("SELECT id FROM timetable_versions WHERE version_hash = ?")
      .get(versionHash);

    if (existingVersion) {
      console.log(
        `[DB] Timetable version already exists (hash: ${versionHash}). Skipping save.`
      );
      return {
        saved: false,
        reason: "Version already in database",
        eventCount: events.length,
        versionHash,
      };
    }

    // Start transaction for atomic insert
    const insertEvent = db.prepare(`
      INSERT OR REPLACE INTO events (event_id, title, date, start_time, end_time, type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const transaction = db.transaction(() => {
      let insertedCount = 0;
      let updatedCount = 0;

      events.forEach((event) => {
        const eventId = generateEventId(event);

        // Check if event already exists
        const existingEvent = db
          .prepare("SELECT id FROM events WHERE event_id = ?")
          .get(eventId);

        if (existingEvent) {
          updatedCount++;
          // Log change in history
          db.prepare(
            "INSERT INTO event_history (event_id, change_type) VALUES (?, ?)"
          ).run(eventId, "updated");
        } else {
          insertedCount++;
        }

        insertEvent.run(
          eventId,
          event.title,
          event.date,
          event.startTime,
          event.endTime,
          event.type
        );
      });

      // Record timetable version
      db.prepare(
        `INSERT INTO timetable_versions (version_hash, total_events, source, notes)
         VALUES (?, ?, ?, ?)`
      ).run(
        versionHash,
        events.length,
        source,
        `Parsed ${insertedCount} new, updated ${updatedCount} existing`
      );

      return { insertedCount, updatedCount };
    });

    const { insertedCount, updatedCount } = transaction();
    const duration = Date.now() - startTime;

    console.log(
      `[DB] Saved timetable: ${insertedCount} inserted, ${updatedCount} updated in ${duration}ms`
    );

    return {
      saved: true,
      insertedCount,
      updatedCount,
      totalEvents: events.length,
      versionHash,
      duration,
    };
  } catch (error) {
    console.error("[DB] Error saving timetable:", error.message);
    throw error;
  }
}

/**
 * Get all events from database
 * @returns {array} Array of event objects
 */
function getAllEvents() {
  const db = getDatabase();
  const events = db
    .prepare(
      `SELECT event_id, title, date, start_time, end_time, type 
       FROM events 
       ORDER BY date ASC, start_time ASC`
    )
    .all();

  return events.map((e) => ({
    id: e.event_id,
    title: e.title,
    date: e.date,
    startTime: e.start_time,
    endTime: e.end_time,
    type: e.type,
  }));
}

/**
 * Get events by date range
 * @param {string} startDate - ISO format date (YYYY-MM-DD)
 * @param {string} endDate - ISO format date (YYYY-MM-DD)
 * @returns {array} Array of events within date range
 */
function getEventsByDateRange(startDate, endDate) {
  const db = getDatabase();
  const events = db
    .prepare(
      `SELECT event_id, title, date, start_time, end_time, type 
       FROM events 
       WHERE date BETWEEN ? AND ? 
       ORDER BY date ASC, start_time ASC`
    )
    .all(startDate, endDate);

  return events.map((e) => ({
    id: e.event_id,
    title: e.title,
    date: e.date,
    startTime: e.start_time,
    endTime: e.end_time,
    type: e.type,
  }));
}

/**
 * Get events by type
 * @param {string} type - Event type (lecture, lab, exam, etc.)
 * @returns {array} Array of events of specified type
 */
function getEventsByType(type) {
  const db = getDatabase();
  const events = db
    .prepare(
      `SELECT event_id, title, date, start_time, end_time, type 
       FROM events 
       WHERE type = ? 
       ORDER BY date ASC, start_time ASC`
    )
    .all(type);

  return events.map((e) => ({
    id: e.event_id,
    title: e.title,
    date: e.date,
    startTime: e.start_time,
    endTime: e.end_time,
    type: e.type,
  }));
}

/**
 * Get database statistics and metadata
 * @returns {object} Stats about events and versions
 */
function getDatabaseStats() {
  const db = getDatabase();

  const totalEvents = db.prepare("SELECT COUNT(*) as count FROM events").get()
    .count;

  const eventTypes = db
    .prepare(
      `SELECT type, COUNT(*) as count 
       FROM events 
       GROUP BY type 
       ORDER BY count DESC`
    )
    .all();

  const latestVersion = db
    .prepare(
      `SELECT version_hash, total_events, source, fetched_at, notes
       FROM timetable_versions 
       ORDER BY fetched_at DESC 
       LIMIT 1`
    )
    .get();

  const totalVersions = db
    .prepare("SELECT COUNT(*) as count FROM timetable_versions")
    .get().count;

  return {
    totalEvents,
    eventTypes: eventTypes.reduce(
      (acc, row) => ({ ...acc, [row.type]: row.count }),
      {}
    ),
    latestVersion,
    totalVersions,
    database: "SQLite (timetable.db)",
  };
}

/**
 * Clear all events (for testing/reset)
 * WARNING: This deletes all data
 * @returns {object} Confirmation
 */
function clearAllEvents() {
  const db = getDatabase();
  const deletedEvents = db.prepare("SELECT COUNT(*) as count FROM events").get()
    .count;

  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM event_history").run();

  console.log(`[DB] Cleared ${deletedEvents} events from database`);
  return { cleared: true, deletedEvents };
}

module.exports = {
  generateEventId,
  generateVersionHash,
  saveTimetableEvents,
  getAllEvents,
  getEventsByDateRange,
  getEventsByType,
  getDatabaseStats,
  clearAllEvents,
};
