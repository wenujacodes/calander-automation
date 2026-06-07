const XLSX = require("xlsx");

/**
 * Map of event keywords to event types
 * Used to classify events without hardcoding event names
 */
const EVENT_TYPE_KEYWORDS = {
  lecture: ["lec", "lecture", "class"],
  lab: ["lab", "practical", "prac"],
  tutorial: ["tut", "tutorial"],
  orientation: ["orientation", "induction"],
  faculty: ["faculty"],
  inauguration: ["inauguration", "inaug"],
  workshop: ["workshop", "seminar"],
  project: ["project", "assignment"],
  exam: ["exam", "test", "assessment"],
  holiday: ["poya", "holiday", "break", "vacation", "festival"],
};

/**
 * Convert time string from 12-hour format (e.g., "09.00 am") to 24-hour format (e.g., "09:00")
 * @param {string} timeStr - Time string in format "HH.MM am/pm"
 * @returns {string} Time in 24-hour format "HH:MM" or null if invalid
 */
function convertTo24HourFormat(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;

  const timeMatch = timeStr.match(/(\d{1,2})\.(\d{2})\s*(am|pm)/i);
  if (!timeMatch) {
    console.warn(`Invalid time format: "${timeStr}"`);
    return null;
  }

  let hours = parseInt(timeMatch[1]);
  const minutes = timeMatch[2];
  const period = timeMatch[3].toLowerCase();

  // Convert 12-hour to 24-hour format
  if (period === "pm" && hours !== 12) {
    hours += 12;
  } else if (period === "am" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

/**
 * Convert date string from "DD-MMM-YY" format to ISO format "YYYY-MM-DD"
 * Handles Excel serial dates as well
 * @param {string|number} dateValue - Date string or Excel serial number
 * @returns {string} ISO format date "YYYY-MM-DD" or null if invalid
 */
function convertToISODate(dateValue) {
  if (!dateValue) return null;

  let date;

  // Handle Excel serial dates (numbers)
  if (typeof dateValue === "number") {
    // Excel date serial number: days since 1900-01-01
    const excelEpoch = new Date(1900, 0, 1);
    date = new Date(excelEpoch.getTime() + dateValue * 86400000);
  } else if (typeof dateValue === "string") {
    // Handle date string formats like "27-Feb-26", "27-02-2026", etc.
    const dateMatch = dateValue.match(
      /(\d{1,2})-([A-Za-z]{3})-(\d{2,4})|(\d{1,2})-(\d{1,2})-(\d{4})/
    );
    if (!dateMatch) {
      console.warn(`Invalid date format: "${dateValue}"`);
      return null;
    }

    if (dateMatch[1]) {
      // Format: DD-MMM-YY or DD-MMM-YYYY
      const day = dateMatch[1];
      const monthStr = dateMatch[2];
      let year = parseInt(dateMatch[3]);

      // Convert 2-digit year to 4-digit (assume 2000s for 00-99)
      if (year < 100) {
        year += 2000;
      }

      const monthMap = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };

      const month = monthMap[monthStr.toLowerCase()];
      if (month === undefined) {
        console.warn(`Invalid month: "${monthStr}"`);
        return null;
      }

      date = new Date(year, month, parseInt(day));
    } else if (dateMatch[4]) {
      // Format: DD-MM-YYYY
      date = new Date(dateMatch[6], dateMatch[5] - 1, dateMatch[4]);
    }
  } else {
    console.warn(`Invalid date value type: ${typeof dateValue}`);
    return null;
  }

  // Validate date
  if (isNaN(date.getTime())) {
    console.warn(`Invalid date: "${dateValue}"`);
    return null;
  }

  // Convert to ISO format
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Determine event type based on the event title
 * Uses keyword matching to classify events reusably
 * @param {string} title - Event title
 * @returns {string} Event type classification
 */
function classifyEventType(title) {
  if (!title) return "event";

  const lowerTitle = String(title).toLowerCase();

  // Check against keyword categories
  for (const [type, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => lowerTitle.includes(keyword))) {
      return type;
    }
  }

  return "event";
}

/**
 * Check if an event should be excluded (e.g., holidays)
 * @param {string} title - Event title
 * @returns {boolean} True if event should be excluded
 */
function shouldExcludeEvent(title) {
  if (!title) return false;
  return classifyEventType(title) === "holiday";
}

/**
 * Get the cell reference from row and column indices
 * @param {number} row - 0-based row index
 * @param {number} col - 0-based column index
 * @returns {string} Cell reference like "A1", "B2", etc.
 */
function getCellReference(row, col) {
  const colLetter = String.fromCharCode(65 + col);
  return `${colLetter}${row + 1}`;
}

/**
 * Get column index from cell reference letter
 * @param {string} letter - Column letter (A, B, C, etc.)
 * @returns {number} 0-based column index
 */
function getColumnIndex(letter) {
  return letter.charCodeAt(0) - 65;
}

/**
 * Parse merged cell range string (e.g., "A1:B2")
 * @param {string} rangeStr - Range string
 * @returns {object} Parsed range with startRow, endRow, startCol, endCol
 */
function parseRange(rangeStr) {
  const [start, end] = rangeStr.split(":");
  const startMatch = start.match(/([A-Z]+)(\d+)/);
  const endMatch = end.match(/([A-Z]+)(\d+)/);

  return {
    startRow: parseInt(startMatch[2]) - 1,
    startCol: getColumnIndex(startMatch[1]),
    endRow: parseInt(endMatch[2]) - 1,
    endCol: getColumnIndex(endMatch[1]),
  };
}

/**
 * Main parser function: Extract timetable events from Excel worksheet
 * Algorithm:
 * 1. Iterate through all merged cell ranges
 * 2. Skip if the top-left cell of the merge is empty
 * 3. Extract event title from top-left cell
 * 4. Skip holidays and empty events
 * 5. Get event date from row 7 in the merged range column
 * 6. Get start time from first row of merged range in column B
 * 7. Get end time from last row of merged range in column B
 * 8. Create event object with standardized formatting
 * 9. Sort by date and start time
 *
 * @param {object} worksheet - XLSX worksheet object
 * @returns {array} Array of event objects with title, date, startTime, endTime, type
 */
function parseTimetable(worksheet) {
  if (!worksheet) {
    console.error("Worksheet is undefined");
    return [];
  }

  const events = [];
  const merges = worksheet["!merges"] || [];

  console.log(
    `[Parser] Found ${merges.length} merged ranges. Starting parsing...`
  );

  // Track processed events to avoid duplicates
  const processedRanges = new Set();

  merges.forEach((merge, index) => {
    const rangeStr = XLSX.utils.encode_range(merge);

    if (processedRanges.has(rangeStr)) {
      return; // Skip already processed ranges
    }

    const range = parseRange(rangeStr);
    const topLeftCell = getCellReference(range.startRow, range.startCol);

    // Get event title from top-left cell of merged range
    const titleCell = worksheet[topLeftCell];
    const eventTitle = titleCell ? titleCell.v : "";

    // Skip empty cells
    if (!eventTitle || !eventTitle.toString().trim()) {
      console.log(
        `[Parser] Merge ${rangeStr} (index ${index}): Empty cell, skipping`
      );
      return;
    }

    // Skip holidays
    if (shouldExcludeEvent(eventTitle)) {
      console.log(
        `[Parser] Merge ${rangeStr}: Excluded event "${eventTitle}"`
      );
      return;
    }

    // Mark range as processed
    processedRanges.add(rangeStr);

    // Extract event date from row 7 (index 6) in the merged column
    const dateCell = worksheet[getCellReference(6, range.startCol)];
    const eventDate = dateCell ? dateCell.v : null;
    const isoDate = convertToISODate(eventDate);

    if (!isoDate) {
      console.warn(
        `[Parser] Merge ${rangeStr}: Could not parse date "${eventDate}"`
      );
      return;
    }

    // Extract start time from first row of merged range (column B = index 1)
    const startTimeCell = worksheet[getCellReference(range.startRow, 1)];
    const startTimeStr = startTimeCell ? startTimeCell.v : "";
    const startTime = convertTo24HourFormat(startTimeStr);

    if (!startTime) {
      console.warn(
        `[Parser] Merge ${rangeStr}: Could not parse start time "${startTimeStr}"`
      );
      return;
    }

    // Extract end time from last row of merged range (column B = index 1)
    const endTimeCell = worksheet[getCellReference(range.endRow, 1)];
    const endTimeStr = endTimeCell ? endTimeCell.v : "";
    const endTime = convertTo24HourFormat(endTimeStr);

    if (!endTime) {
      console.warn(
        `[Parser] Merge ${rangeStr}: Could not parse end time "${endTimeStr}"`
      );
      return;
    }

    // Classify event type
    const eventType = classifyEventType(eventTitle);

    // Create event object
    const event = {
      title: eventTitle.toString().trim(),
      date: isoDate,
      startTime,
      endTime,
      type: eventType,
    };

    events.push(event);

    console.log(
      `[Parser] Merge ${rangeStr} (index ${index}): Parsed event "${eventTitle}" on ${isoDate} from ${startTime} to ${endTime}`
    );
  });

  // Sort events by date and start time
  events.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime);
  });

  console.log(
    `[Parser] Successfully parsed ${events.length} events from timetable`
  );
  return events;
}

module.exports = {
  parseTimetable,
  convertTo24HourFormat,
  convertToISODate,
  classifyEventType,
  shouldExcludeEvent,
};
