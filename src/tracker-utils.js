const URL_KEYS = ["website", "url", "application url", "link"];
const NAME_KEYS = ["scholarship name", "platform", "name"];
const ORG_KEYS = ["organization", "org"];
const AMOUNT_KEYS = ["typical amount", "amount", "amount ($)"];
const SEARCH_KEYS = ["suggested search", "search", "notes"];

export function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function rowToObject(headers, rowValues) {
  const obj = {};
  headers.forEach((header, index) => {
    if (header) obj[header] = rowValues[index] ?? "";
  });
  return obj;
}

export function pickField(obj, keys) {
  for (const [header, value] of Object.entries(obj)) {
    const normalized = normalizeHeader(header);
    if (keys.some((key) => normalized.includes(key)) && value) {
      return String(value).trim();
    }
  }
  return "";
}

export function parseScholarshipRow(rowObj, sheetName, rowNumber) {
  const website = pickField(rowObj, URL_KEYS);
  if (!website || !/^https?:\/\//i.test(website)) return null;

  let name = pickField(rowObj, NAME_KEYS);
  try {
    name = name || new URL(website).hostname.replace(/^www\./, "");
  } catch {
    name = name || website;
  }

  return {
    id: `${sheetName}:${rowNumber}`,
    sheet: sheetName,
    rowNumber,
    name,
    organization: pickField(rowObj, ORG_KEYS),
    amount: pickField(rowObj, AMOUNT_KEYS),
    website,
    suggestedSearch: pickField(rowObj, SEARCH_KEYS),
    raw: rowObj,
  };
}

export function parseRowsFromTable(headers, rows, sheetName) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const scholarships = [];
  rows.forEach((rowValues, index) => {
    if (!rowValues?.some((cell) => cell != null && String(cell).trim())) return;
    const rowObj = rowToObject(normalizedHeaders, rowValues);
    const scholarship = parseScholarshipRow(rowObj, sheetName, index + 2);
    if (scholarship) scholarships.push(scholarship);
  });
  return scholarships;
}
