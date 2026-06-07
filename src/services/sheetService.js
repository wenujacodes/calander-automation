const axios = require("axios");
const XLSX = require("xlsx");
const { parseTimetable } = require("./utils/parser");

const SHEET_URL = process.env.SHEET_URL;

/**
 * Fetch the timetable from SharePoint and parse events from merged cells
 * @returns {Promise<array>} Array of parsed timetable events
 * @throws {Error} If the sheet cannot be fetched or parsed
 */
async function fetchAndParseTimetable() {
  try {
    console.log("[SheetService] Fetching timetable from SharePoint...");

    const response = await axios.get(SHEET_URL, {
      responseType: "arraybuffer",
      timeout: 10000,
    });

    console.log("[SheetService] Successfully fetched timetable");

    // Parse workbook with merged cell information preserved
    const workbook = XLSX.read(response.data, { type: "buffer" });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("No worksheets found in the Excel file");
    }

    const sheetName = workbook.SheetNames[0];
    console.log(`[SheetService] Parsing sheet: "${sheetName}"`);

    const worksheet = workbook.Sheets[sheetName];

    // Parse timetable from merged cells
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