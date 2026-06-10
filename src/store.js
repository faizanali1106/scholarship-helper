/**
 * Local-first scholarship store.
 *
 * Keeps all scraped scholarships + their apply status in a single JSON file
 * so the app works on any machine WITHOUT Google Sheets / Apps Script.
 * Google Sheet sync stays optional (handled separately in tracker.js).
 */
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { enrichRecord } from "./match.js";
import { isServerless } from "./env.js";

const STORE_PATH = path.join(config.root, "data", "scholarships.json");

function readRaw() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { scholarships: [], updatedAt: null };
    const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (!Array.isArray(data.scholarships)) data.scholarships = [];
    return data;
  } catch {
    return { scholarships: [], updatedAt: null };
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Map a scraped item (or sheet-row shaped object) into a store record.
 */
function toRecord(item, source) {
  const url =
    item.url ||
    item.website ||
    item["Application URL"] ||
    item["Website"] ||
    item["URL"] ||
    "";
  return {
    name: item.name || item["Scholarship Name"] || "",
    organization: item.organization || item.funder || item["Organization"] || "",
    amount: item.amount || item["Amount"] || "",
    deadline: item.deadline || item["Deadline"] || "",
    description: item.description || item.notes || item["Notes"] || "",
    url,
    source: item.source || source || item["Type"] || "",
    status: item.status || "Not Started",
    applyResult: item.applyResult || "",
    appliedAt: item.appliedAt || "",
    screenshot: item.screenshot || "",
    scrapedAt: item.scrapedAt || item["Scraped At"] || new Date().toISOString(),
    state: item.state || item.State || "",
    matchScore: item.matchScore ?? 0,
    matchTags: item.matchTags || [],
  };
}

export function getAll({ sort = true } = {}) {
  const list = readRaw().scholarships.map((s) => enrichRecord(s));
  if (!sort) return list;
  return list.sort((a, b) => {
    const scoreDiff = (b.matchScore || 0) - (a.matchScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.name || "").localeCompare(b.name || "");
  });
}

export function getPending(limit = null) {
  const pending = getAll().filter(
    (s) => s.url && !["Submitted", "Filled", "Skipped"].includes(s.status)
  );
  return limit != null ? pending.slice(0, limit) : pending;
}

export function getSummary() {
  const all = getAll();
  const by = (status) => all.filter((s) => s.status === status).length;
  const sources = {};
  for (const s of all) {
    const key = s.source || "Other";
    sources[key] = (sources[key] || 0) + 1;
  }
  return {
    total: all.length,
    notStarted: by("Not Started"),
    inProgress: by("In Progress"),
    filled: by("Filled"),
    submitted: by("Submitted"),
    skipped: by("Skipped"),
    failed: by("Failed"),
    sources,
  };
}

/**
 * Add/merge scholarships. De-dupes by normalized URL.
 * Returns { added, skipped }.
 */
export function addScholarships(items, source) {
  const data = readRaw();
  const existing = new Map(
    data.scholarships.map((s) => [normalizeUrl(s.url), s])
  );

  let added = 0;
  let skipped = 0;

  for (const item of items || []) {
    const record = toRecord(item, source);
    if (!record.url || !/^https?:\/\//i.test(record.url)) {
      skipped++;
      continue;
    }
    const key = normalizeUrl(record.url);
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    existing.set(key, enrichRecord(record));
    if (!isServerless()) {
      data.scholarships.push(existing.get(key));
    }
    added++;
  }

  if (!isServerless()) {
    data.updatedAt = new Date().toISOString();
    writeRaw(data);
  }
  return { added, skipped, total: isServerless() ? existing.size : data.scholarships.length };
}

/**
 * Update the status (and optional extra fields) for a scholarship by URL.
 */
export function updateStatus(url, status, extra = {}) {
  const data = readRaw();
  const key = normalizeUrl(url);
  const record = data.scholarships.find((s) => normalizeUrl(s.url) === key);
  if (!record) return false;
  record.status = status;
  if (extra.applyResult !== undefined) record.applyResult = extra.applyResult;
  if (extra.screenshot !== undefined) record.screenshot = extra.screenshot;
  if (status === "Submitted" || status === "Filled") {
    record.appliedAt = new Date().toISOString();
  }
  data.updatedAt = new Date().toISOString();
  writeRaw(data);
  return true;
}

export function clearAll() {
  writeRaw({ scholarships: [], updatedAt: new Date().toISOString() });
}

export function resetFailed() {
  const data = readRaw();
  let count = 0;
  for (const s of data.scholarships) {
    if (s.status === "Failed") {
      s.status = "Not Started";
      s.applyResult = "";
      s.screenshot = "";
      count++;
    }
  }
  data.updatedAt = new Date().toISOString();
  writeRaw(data);
  return count;
}

export { STORE_PATH };
