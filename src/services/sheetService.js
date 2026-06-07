const axios = require("axios");
const XLSX = require("xlsx");

const SHEET_URL = process.env.SHEET_URL;

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

module.exports = { fetchSheet };