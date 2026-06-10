import ExcelJS from "exceljs";
import { getExcelPath, loadSettings } from "./settings.js";
import { parseRowsFromTable, normalizeHeader } from "./tracker-utils.js";

export async function loadScholarships(sheetNames) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(getExcelPath());
  const scholarships = [];
  const settings = loadSettings();
  const names = sheetNames || settings.sourceSheetNames;

  for (const sheetName of names) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      console.warn(`Sheet not found: ${sheetName}`);
      continue;
    }

    const rows = sheet.getSheetValues().slice(1);
    if (!rows.length) continue;

    const headerRow = rows[0] || [];
    const headers = headerRow.slice(1).map((cell) => String(cell || ""));

    const parsed = parseRowsFromTable(
      headers,
      rows.slice(1).map((r) => (r || []).slice(1)),
      sheetName
    );
    scholarships.push(...parsed);
  }

  return scholarships;
}

export async function listTrackerSummary() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(getExcelPath());
  const settings = loadSettings();
  const summary = [];

  for (const sheetName of [...settings.sourceSheetNames, settings.masterSheetName]) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    summary.push({
      sheet: sheetName,
      rowCount: Math.max(0, sheet.rowCount - 1),
    });
  }

  return summary;
}

function findOrCreateMasterRow(sheet, scholarship) {
  const headers = sheet.getRow(1).values.slice(1).map(normalizeHeader);

  const nameCol = headers.findIndex((h) => h.includes("scholarship name")) + 1;
  const urlCol =
    headers.findIndex((h) => h.includes("application url") || h === "website") +
    1;
  const statusCol = headers.findIndex((h) => h.includes("status")) + 1;
  const notesCol = headers.findIndex((h) => h.includes("notes")) + 1;
  const orgCol = headers.findIndex((h) => h.includes("organization")) + 1;
  const amountCol = headers.findIndex((h) => h.includes("amount")) + 1;

  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const existingUrl = urlCol ? String(row.getCell(urlCol).value || "").trim() : "";
    const existingName = nameCol ? String(row.getCell(nameCol).value || "").trim() : "";

    if (
      (existingUrl && existingUrl === scholarship.website) ||
      (existingName && existingName === scholarship.name)
    ) {
      return { row, rowNum, statusCol, notesCol };
    }
  }

  const newRowNum = sheet.rowCount + 1;
  const row = sheet.getRow(newRowNum);
  if (nameCol) row.getCell(nameCol).value = scholarship.name;
  if (orgCol && scholarship.organization) row.getCell(orgCol).value = scholarship.organization;
  if (amountCol && scholarship.amount) row.getCell(amountCol).value = scholarship.amount;
  if (urlCol) row.getCell(urlCol).value = scholarship.website;
  if (statusCol) row.getCell(statusCol).value = "Not Started";
  if (notesCol) row.getCell(notesCol).value = `Imported from ${scholarship.sheet}`;

  return { row, rowNum: newRowNum, statusCol, notesCol };
}

export async function updateScholarshipStatus(scholarship, status, note = "") {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(getExcelPath());
  const settings = loadSettings();

  const masterSheet = workbook.getWorksheet(settings.masterSheetName);
  if (!masterSheet) {
    throw new Error(`Missing sheet: ${settings.masterSheetName}`);
  }

  const { row, statusCol, notesCol } = findOrCreateMasterRow(
    masterSheet,
    scholarship
  );

  if (statusCol) row.getCell(statusCol).value = status;
  if (notesCol && note) {
    const existing = String(row.getCell(notesCol).value || "").trim();
    row.getCell(notesCol).value = existing ? `${existing} | ${note}` : note;
  }

  await workbook.xlsx.writeFile(getExcelPath());
}
