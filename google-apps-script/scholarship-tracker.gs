/**
 * Scholarship Helper — Google Apps Script
 *
 * SETUP (one time):
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this entire file, save
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web app URL into Scholarship Helper setup
 *
 * After updating this file: Deploy → Manage deployments → edit → New version → Deploy.
 * The Bold.org scraper sends scraped rows with action appendScholarships (POST).
 */

function doGet(e) {
  try {
    const action = (e.parameter.action || "list").toLowerCase();
    if (action === "list") return json(listScholarships_(e));
    if (action === "summary") return json(summary_());
    if (action === "ping") return json({ ok: true, message: "Connected" });
    return json({ error: "Unknown action" });
  } catch (err) {
    return json({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    if (body.action === "update") return json(updateStatus_(body));
    if (body.action === "appendScholarships") return json(appendScholarships_(body));
    return json({ error: "Unknown action" });
  } catch (err) {
    return json({ error: String(err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function normalizeHeader(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickField(obj, keys) {
  for (var header in obj) {
    var n = normalizeHeader(header);
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) !== -1 && obj[header]) {
        return String(obj[header]).trim();
      }
    }
  }
  return "";
}

function parseRow(rowObj, sheetName, rowNumber) {
  var website = pickField(rowObj, ["website", "url", "application url", "link"]);
  if (!website || website.indexOf("http") !== 0) return null;
  var name =
    pickField(rowObj, ["scholarship name", "platform", "name"]) ||
    website.replace(/^https?:\/\//, "").split("/")[0];
  return {
    id: sheetName + ":" + rowNumber,
    sheet: sheetName,
    rowNumber: rowNumber,
    name: name,
    organization: pickField(rowObj, ["organization", "org"]),
    amount: pickField(rowObj, ["typical amount", "amount", "amount ($)"]),
    website: website,
    suggestedSearch: pickField(rowObj, ["suggested search", "search", "notes"]),
    raw: rowObj,
  };
}

function readSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(normalizeHeader);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var rowObj = {};
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) rowObj[headers[c]] = values[r][c];
    }
    var item = parseRow(rowObj, sheetName, r + 1);
    if (item) out.push(item);
  }
  return out;
}

function listScholarships_(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var defaultTabs = [
    "Master Tracker",
    "Diabetes Scholarships",
    "Athlete Scholarships",
    "Scholarship Search Links",
    "Scholarships",
  ];
  var tabs = e.parameter.tabs
    ? e.parameter.tabs.split(",")
    : defaultTabs;
  var scholarships = [];
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i].trim();
    if (!tab) continue;
    scholarships = scholarships.concat(readSheet(ss, tab));
  }
  return { scholarships: scholarships, count: scholarships.length };
}

function summary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var out = [];
  for (var i = 0; i < sheets.length; i++) {
    out.push({
      sheet: sheets[i].getName(),
      rowCount: Math.max(0, sheets[i].getLastRow() - 1),
    });
  }
  return { sheets: out };
}

function updateStatus_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterName = body.masterSheetName || "Master Tracker";
  var sheet = ss.getSheetByName(masterName);
  if (!sheet) {
    sheet = ss.insertSheet(masterName);
    sheet.appendRow([
      "Scholarship Name",
      "Organization",
      "Amount ($)",
      "Deadline",
      "Application URL",
      "Status",
      "Notes",
    ]);
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(normalizeHeader);
  var nameCol = headers.indexOf("scholarship name");
  var urlCol = headers.findIndex(function (h) {
    return h.indexOf("application url") !== -1 || h === "website" || h === "url";
  });
  var statusCol = headers.indexOf("status");
  var notesCol = headers.indexOf("notes");
  var orgCol = headers.indexOf("organization");
  var amountCol = headers.findIndex(function (h) {
    return h.indexOf("amount") !== -1;
  });

  if (statusCol === -1) statusCol = headers.length;
  if (notesCol === -1) notesCol = headers.length;

  var scholarship = body.scholarship || {};
  var targetRow = -1;

  for (var r = 1; r < values.length; r++) {
    var rowUrl = urlCol >= 0 ? String(values[r][urlCol] || "").trim() : "";
    var rowName = nameCol >= 0 ? String(values[r][nameCol] || "").trim() : "";
    if (
      (scholarship.website && rowUrl === scholarship.website) ||
      (scholarship.name && rowName === scholarship.name)
    ) {
      targetRow = r + 1;
      break;
    }
  }

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
    if (nameCol >= 0) sheet.getRange(targetRow, nameCol + 1).setValue(scholarship.name || "");
    if (orgCol >= 0 && scholarship.organization)
      sheet.getRange(targetRow, orgCol + 1).setValue(scholarship.organization);
    if (amountCol >= 0 && scholarship.amount)
      sheet.getRange(targetRow, amountCol + 1).setValue(scholarship.amount);
    if (urlCol >= 0) sheet.getRange(targetRow, urlCol + 1).setValue(scholarship.website || "");
  }

  if (statusCol >= 0) sheet.getRange(targetRow, statusCol + 1).setValue(body.status || "");
  if (notesCol >= 0 && body.note) {
    var existing = String(sheet.getRange(targetRow, notesCol + 1).getValue() || "").trim();
    sheet
      .getRange(targetRow, notesCol + 1)
      .setValue(existing ? existing + " | " + body.note : body.note);
  }

  return { ok: true, row: targetRow, status: body.status };
}

var APPEND_HEADERS_ = [
  "Scholarship Name",
  "Type",
  "Organization",
  "Amount",
  "Deadline",
  "Notes",
  "Application URL",
  "Essay Required(Y/N)",
  "Document Needed",
  "Status",
  "Scraped At",
];

function ensureAppendHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(APPEND_HEADERS_);
    return APPEND_HEADERS_.map(normalizeHeader);
  }
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    sheet.appendRow(APPEND_HEADERS_);
    return APPEND_HEADERS_.map(normalizeHeader);
  }
  return values[0].map(normalizeHeader);
}

function colIndex_(headers, keys) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < keys.length; j++) {
      if (headers[i].indexOf(keys[j]) !== -1) return i;
    }
  }
  return -1;
}

function appendScholarships_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterName = body.masterSheetName || "Master Tracker";
  var sheet = ss.getSheetByName(masterName);
  if (!sheet) sheet = ss.insertSheet(masterName);

  var headers = ensureAppendHeaders_(sheet);
  var urlCol = colIndex_(headers, ["application url", "website", "url"]);
  if (urlCol === -1) {
    sheet.getRange(1, headers.length + 1).setValue("Application URL");
    headers = ensureAppendHeaders_(sheet);
    urlCol = colIndex_(headers, ["application url", "website", "url"]);
  }

  var existingUrls = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1 && urlCol >= 0) {
    var urlValues = sheet.getRange(2, urlCol + 1, lastRow, urlCol + 1).getValues();
    for (var u = 0; u < urlValues.length; u++) {
      var existingUrl = String(urlValues[u][0] || "").trim();
      if (existingUrl) existingUrls[existingUrl] = true;
    }
  }

  var incoming = body.scholarships || [];
  var rowsToAppend = [];
  var skipped = 0;

  for (var s = 0; s < incoming.length; s++) {
    var item = incoming[s] || {};
    var url = String(item["Application URL"] || item["Website"] || item["URL"] || "").trim();
    if (!url || url.indexOf("http") !== 0) {
      skipped++;
      continue;
    }
    if (existingUrls[url]) {
      skipped++;
      continue;
    }
    existingUrls[url] = true;

    var row = new Array(headers.length);
    for (var c = 0; c < headers.length; c++) row[c] = "";
    for (var key in item) {
      if (!item.hasOwnProperty(key)) continue;
      var idx = colIndex_(headers, [normalizeHeader(key)]);
      if (idx >= 0) row[idx] = item[key];
    }
    if (urlCol >= 0) row[urlCol] = url;
    rowsToAppend.push(row);
  }

  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(
      rowsToAppend
    );
  }

  return {
    ok: true,
    message:
      "Appended " +
      rowsToAppend.length +
      " scholarship(s)" +
      (skipped ? " (" + skipped + " skipped as duplicates or invalid)" : ""),
    appended: rowsToAppend.length,
    skipped: skipped,
    sheet: masterName,
  };
}
