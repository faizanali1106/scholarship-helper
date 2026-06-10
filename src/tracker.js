import { loadSettings } from "./settings.js";
import * as excel from "./excel.js";
import * as google from "./google-tracker.js";

export async function loadScholarships(sheetNames) {
  const settings = loadSettings();
  if (settings.trackerType === "google" && settings.googleAppsScriptUrl) {
    return google.loadScholarships(sheetNames);
  }
  return excel.loadScholarships(sheetNames);
}

export async function listTrackerSummary() {
  const settings = loadSettings();
  if (settings.trackerType === "google" && settings.googleAppsScriptUrl) {
    return google.listTrackerSummary();
  }
  return excel.listTrackerSummary();
}

export async function updateScholarshipStatus(scholarship, status, note = "") {
  const settings = loadSettings();
  if (settings.trackerType === "google" && settings.googleAppsScriptUrl) {
    return google.updateScholarshipStatus(scholarship, status, note);
  }
  return excel.updateScholarshipStatus(scholarship, status, note);
}

export async function testTrackerConnection() {
  const settings = loadSettings();
  if (settings.trackerType === "google") {
    if (!settings.googleAppsScriptUrl) {
      throw new Error("Paste your Google Apps Script web app URL first.");
    }
    return google.testConnection();
  }
  const list = await excel.loadScholarships();
  return {
    ok: true,
    message: `Excel OK — found ${list.length} scholarship URL(s).`,
    count: list.length,
  };
}
