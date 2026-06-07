const { getDatabase } = require("../db/init");
const { generateEventId } = require("../db/service");

/**
 * Change Detection System
 * Compares current events with previous timetable version in database
 * Identifies: added, removed, modified events
 * Used to sync only deltas to Google Calendar (efficient syncing)
 */

/**
 * Detect changes between current events and database
 * Returns detailed diff with added, removed, and modified events
 *
 * @param {array} currentEvents - Latest parsed events
 * @returns {object} Change detection result with deltas
 *
 * Format:
 * {
 *   hasChanges: true,
 *   added: [...],
 *   removed: [...],
 *   modified: [...],
 *   unchanged: [...],
 *   summary: { added: 5, removed: 2, modified: 3, unchanged: 100 },
 *   changePercentage: 10
 * }
 */
function detectChanges(currentEvents) {
  const db = getDatabase();

  console.log("[ChangeDetection] Starting change detection...");
  console.log(`[ChangeDetection] Current events: ${currentEvents.length}`);

  // Get previous events from database
  const previousEvents = db
    .prepare(
      `SELECT event_id, title, date, start_time, end_time, type 
       FROM events 
       ORDER BY date ASC, start_time ASC`
    )
    .all();

  const previousEventMap = {};
  previousEvents.forEach((e) => {
    previousEventMap[e.event_id] = {
      title: e.title,
      date: e.date,
      startTime: e.start_time,
      endTime: e.end_time,
      type: e.type,
    };
  });

  console.log(`[ChangeDetection] Previous events in DB: ${previousEvents.length}`);

  // Current event map with IDs
  const currentEventMap = {};
  const added = [];
  const modified = [];
  const unchanged = [];

  // Process current events
  currentEvents.forEach((event) => {
    const eventId = generateEventId(event);
    currentEventMap[eventId] = event;

    const previousEvent = previousEventMap[eventId];

    if (!previousEvent) {
      // New event
      added.push({
        ...event,
        eventId,
      });
      console.log(`[ChangeDetection] Added: "${event.title}" on ${event.date}`);
    } else {
      // Check if event changed
      const hasChanges =
        previousEvent.title !== event.title ||
        previousEvent.date !== event.date ||
        previousEvent.startTime !== event.startTime ||
        previousEvent.endTime !== event.endTime ||
        previousEvent.type !== event.type;

      if (hasChanges) {
        modified.push({
          eventId,
          current: event,
          previous: previousEvent,
          changes: {
            title: previousEvent.title !== event.title,
            date: previousEvent.date !== event.date,
            startTime: previousEvent.startTime !== event.startTime,
            endTime: previousEvent.endTime !== event.endTime,
            type: previousEvent.type !== event.type,
          },
        });
        console.log(
          `[ChangeDetection] Modified: "${event.title}" on ${event.date}`
        );
      } else {
        unchanged.push({
          ...event,
          eventId,
        });
      }
    }
  });

  // Find removed events (in DB but not in current)
  const removed = [];
  Object.entries(previousEventMap).forEach(([eventId, previousEvent]) => {
    if (!currentEventMap[eventId]) {
      removed.push({
        ...previousEvent,
        eventId,
      });
      console.log(
        `[ChangeDetection] Removed: "${previousEvent.title}" on ${previousEvent.date}`
      );
    }
  });

  const summary = {
    added: added.length,
    removed: removed.length,
    modified: modified.length,
    unchanged: unchanged.length,
    total: currentEvents.length,
  };

  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;
  const changePercentage =
    currentEvents.length > 0
      ? Math.round(((added.length + removed.length + modified.length) / currentEvents.length) * 100)
      : 0;

  console.log(`[ChangeDetection] Summary: ${JSON.stringify(summary)}`);
  console.log(`[ChangeDetection] Change percentage: ${changePercentage}%`);
  console.log(`[ChangeDetection] Has changes: ${hasChanges}`);

  return {
    hasChanges,
    added,
    removed,
    modified,
    unchanged,
    summary,
    changePercentage,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get only changed events (added + modified)
 * Used for efficient syncing to Google Calendar
 *
 * @param {array} currentEvents - Latest parsed events
 * @returns {object} Only added and modified events
 */
function getChangedEventsOnly(currentEvents) {
  const changes = detectChanges(currentEvents);

  return {
    hasChanges: changes.hasChanges,
    added: changes.added,
    modified: changes.modified,
    removed: changes.removed,
    summary: changes.summary,
    changePercentage: changes.changePercentage,
    timestamp: changes.timestamp,
  };
}

/**
 * Simulate timetable update for testing
 * Creates modified version of an event
 * @param {array} events - Current events
 * @param {number} count - Number of events to modify
 * @returns {array} Modified events
 */
function simulateUpdate(events, count = 5) {
  console.log(`[ChangeDetection] Simulating update: modifying ${count} events`);

  const modified = [...events];
  for (let i = 0; i < Math.min(count, modified.length); i++) {
    // Modify title slightly
    modified[i].title = `UPDATED: ${modified[i].title}`;
  }

  // Add new event
  modified.push({
    title: "NEW EVENT - Special Lecture",
    date: events[0].date, // Same date as first event
    startTime: "16:00",
    endTime: "17:00",
    type: "lecture",
  });

  return modified;
}

module.exports = {
  detectChanges,
  getChangedEventsOnly,
  simulateUpdate,
};
