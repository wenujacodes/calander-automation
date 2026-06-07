const Database = require("better-sqlite3");
const path = require("path");

/**
 * Initialize the SQLite database with schema
 * Creates tables for events, history, and metadata
 * @returns {Database} Database instance
 */
function initializeDatabase() {
  const dbPath = path.join(__dirname, "../../timetable.db");
  const db = new Database(dbPath);

  console.log("[DB] Database initialized at:", dbPath);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    -- Store parsed timetable events
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Track event changes for change detection
    CREATE TABLE IF NOT EXISTS event_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_field TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(event_id)
    );

    -- Track timetable versions and sync metadata
    CREATE TABLE IF NOT EXISTS timetable_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_hash TEXT UNIQUE NOT NULL,
      total_events INTEGER NOT NULL,
      source TEXT NOT NULL,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    );

    -- Store latest timetable state for comparison
    CREATE TABLE IF NOT EXISTS timetable_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      event_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (version_id) REFERENCES timetable_versions(id)
    );

    -- Create indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);
    CREATE INDEX IF NOT EXISTS idx_history_event_id ON event_history(event_id);
    CREATE INDEX IF NOT EXISTS idx_versions_hash ON timetable_versions(version_hash);
  `);

  console.log("[DB] Schema initialized successfully");
  return db;
}

/**
 * Get or create database connection
 * @returns {Database} Database instance
 */
function getDatabase() {
  const dbPath = path.join(__dirname, "../../timetable.db");
  return new Database(dbPath);
}

module.exports = {
  initializeDatabase,
  getDatabase,
};
