/**
 * Persist scraped scholarships to the local store (always) and to
 * Google Sheets (only if configured). This keeps the app fully working
 * on any machine even with no Google setup.
 */
import { addScholarships } from "../store.js";
import { loadSettings } from "../settings.js";
import { toSheetRows } from "./sheet-row.js";
import { appendScholarships } from "../google-tracker.js";

export async function persistScraped(items, source) {
  const clean = (items || []).filter((i) => i && (i.url || i.website));

  // 1. Local store (always) — this is the source of truth.
  const local = addScholarships(clean, source);

  // 2. Google Sheet (optional, best-effort).
  let google = null;
  const settings = loadSettings();
  if (settings.trackerType === "google" && settings.googleAppsScriptUrl) {
    try {
      const rows = toSheetRows(clean, source);
      google = await appendScholarships(rows);
    } catch (error) {
      google = { ok: false, error: error.message };
    }
  }

  return {
    added: local.added,
    skipped: local.skipped,
    total: local.total,
    google,
  };
}
