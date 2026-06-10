import { loadSettings } from "./settings.js";
import { parseRowsFromTable } from "./tracker-utils.js";

async function callAppsScript(params = {}, body = null) {
  const settings = loadSettings();
  const base = settings.googleAppsScriptUrl?.trim();
  if (!base) throw new Error("Google Apps Script URL is not configured.");

  const url = new URL(base);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });

  const options = body
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    : { method: "GET" };

  const res = await fetch(url.toString(), options);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || "Google Sheet connection failed.");
  }
  return data;
}

export async function loadScholarships(sheetNames) {
  const settings = loadSettings();
  const tabs = (sheetNames || settings.sourceSheetNames || []).join(",");
  const data = await callAppsScript({ action: "list", tabs });
  return data.scholarships || [];
}

export async function listTrackerSummary() {
  const settings = loadSettings();
  const data = await callAppsScript({ action: "summary" });
  return data.sheets || settings.sourceSheetNames.map((name) => ({ sheet: name, rowCount: 0 }));
}

export async function updateScholarshipStatus(scholarship, status, note = "") {
  await callAppsScript({}, {
    action: "update",
    scholarship: {
      name: scholarship.name,
      website: scholarship.website,
      sheet: scholarship.sheet,
      organization: scholarship.organization || "",
      amount: scholarship.amount || "",
    },
    status,
    note,
    masterSheetName: loadSettings().masterSheetName,
  });
}

export async function testConnection() {
  const list = await loadScholarships();
  return {
    ok: true,
    message: `Google Sheet connected — found ${list.length} scholarship URL(s).`,
    count: list.length,
  };
}

export async function appendScholarships(scholarships, options = {}) {
  const settings = loadSettings();
  const rows = Array.isArray(scholarships) ? scholarships : [];
  if (!rows.length) {
    return { ok: true, message: "No scholarships to append", appended: 0, skipped: 0 };
  }
  return callAppsScript(
    {},
    {
      action: "appendScholarships",
      scholarships: rows,
      masterSheetName: options.masterSheetName || settings.masterSheetName || "Master Tracker",
      timestamp: new Date().toISOString(),
    }
  );
}

export { parseRowsFromTable };
