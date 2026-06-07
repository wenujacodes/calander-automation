const axios = require("axios");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { parseTimetable } = require("./utils/parser");

const SHEET_URL = process.env.SHEET_URL;
const USE_LOCAL_FILE = process.env.USE_LOCAL_FILE === "true";

/**
 * Load timetable from a local Excel file
 * Used for testing without SharePoint authentication
 * @param {string} filePath - Path to the Excel file
 * @returns {Promise<array>} Array of parsed timetable events
 * @throws {Error} If file not found or parsing fails
 */
async function loadLocalTimetable(filePath) {
  return new Promise((resolve, reject) => {
    console.log("[LOCAL MODE] Loading local timetable file...");
    console.log(`[LOCAL MODE] File path: ${filePath}`);

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file from disk
      const fileBuffer = fs.readFileSync(filePath);
      console.log("[LOCAL MODE] File read successfully");

      // Parse workbook with merged cell information preserved
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("No worksheets found in the Excel file");
      }

      const sheetName = workbook.SheetNames[0];
      console.log(`[LOCAL MODE] Parsing sheet: "${sheetName}"`);

      const worksheet = workbook.Sheets[sheetName];

      // Parse timetable from merged cells using existing parser
      const events = parseTimetable(worksheet);

      console.log(
        `[LOCAL MODE] Successfully loaded timetable with ${events.length} events`
      );
      resolve(events);
    } catch (error) {
      console.error("[LOCAL MODE] Error loading local timetable:", error.message);
      reject(new Error(`Failed to load local timetable: ${error.message}`));
    }
  });
}

/**
 * Fetch the timetable from SharePoint and parse events from merged cells
 * @returns {Promise<array>} Array of parsed timetable events
 * @throws {Error} If the sheet cannot be fetched or parsed
 */
async function fetchFromSharePoint() {
  try {
    console.log("[SheetService] Fetching timetable from SharePoint...");

    const response = await axios.get(SHEET_URL, {
      responseType: "arraybuffer",
      timeout: 10000,
    });

    console.log("[SheetService] Successfully fetched timetable from SharePoint");

    // Parse workbook with merged cell information preserved
    const workbook = XLSX.read(response.data, { type: "buffer" });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("No worksheets found in the Excel file");
    }

    const sheetName = workbook.SheetNames[0];
    console.log(`[SheetService] Parsing sheet: "${sheetName}"`);

    const worksheet = workbook.Sheets[sheetName];

    // Parse timetable from merged cells using existing parser
    const events = parseTimetable(worksheet);

    console.log(
      `[SheetService] Timetable parsing completed with ${events.length} events`
    );
    return events;
  } catch (error) {
    console.error("[SheetService] Error fetching/parsing timetable:", error.message);
    throw new Error(`Failed to fetch timetable: ${error.message}`);
  }
}

/**
 * Main function to fetch and parse timetable
 * Architecture: Uses local file mode if USE_LOCAL_FILE=true, otherwise uses SharePoint
 * Both sources are parsed by the same parser, ensuring consistent output format
 * @returns {Promise<array>} Array of parsed timetable events
 * @throws {Error} If neither local file nor SharePoint fetch succeeds
 */
async function fetchAndParseTimetable() {
  if (USE_LOCAL_FILE) {
    // Local file mode for testing
    const localFilePath = path.join(
      __dirname,
      "../test-data/Year 1 Semester 1 Timetable.xlsx"
    );
    return loadLocalTimetable(localFilePath);
  } else {
    // SharePoint mode for production
    return fetchFromSharePoint();
  }
}

/**
 * Fetch raw sheet data (for legacy compatibility)
 * @returns {Promise<array>} Array of sheet data as JSON
 * @deprecated Use fetchAndParseTimetable() instead for structured event data
 */
async function fetchSheet() {
  const response = await axios.get(SHEET_URL, {
    responseType: "arraybuffer",
  });

  const workbook = XLSX.read(response.data, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data = XLSX.utils.sheet_to_json(sheet);

  return data;
}

module.exports = { fetchAndParseTimetable, fetchSheet };