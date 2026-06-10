/**
 * Browser-local persistence — no database required.
 * Statuses (and optional list cache) survive reloads on Vercel and localhost.
 */

const STATUS_KEY = "scholarship-hub-status-v1";
const LIST_KEY = "scholarship-hub-list-v1";

export function normalizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** All saved statuses keyed by normalized URL. */
export function getStatusMap() {
  return readJson(STATUS_KEY, {});
}

export function getStatus(url) {
  const entry = getStatusMap()[normalizeUrl(url)];
  return entry?.status || null;
}

export function setStatus(url, status) {
  const key = normalizeUrl(url);
  if (!key) return;
  const map = getStatusMap();
  map[key] = {
    status,
    updatedAt: new Date().toISOString(),
  };
  writeJson(STATUS_KEY, map);
}

/** Overlay saved statuses onto scholarship rows from the server. */
export function applyStatuses(scholarships) {
  const map = getStatusMap();
  return (scholarships || []).map((s) => {
    const saved = map[normalizeUrl(s.url)];
    if (!saved?.status) return s;
    return {
      ...s,
      status: saved.status,
      appliedAt: saved.updatedAt || s.appliedAt,
    };
  });
}

/** Merge server list with any extra rows cached in this browser. */
export function mergeLists(serverList, cachedList) {
  const byUrl = new Map();
  for (const row of [...(cachedList || []), ...(serverList || [])]) {
    if (!row?.url) continue;
    byUrl.set(normalizeUrl(row.url), row);
  }
  return [...byUrl.values()];
}

export function getCachedList() {
  return readJson(LIST_KEY, []);
}

export function saveCachedList(scholarships) {
  writeJson(LIST_KEY, scholarships || []);
}

/** Build summary stats from the current in-memory list. */
export function buildSummary(scholarships) {
  const all = scholarships || [];
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
    submitted: by("Submitted"),
    skipped: by("Skipped"),
    failed: by("Failed"),
    sources,
  };
}

/** Export statuses + list for backup / moving to another device. */
export function exportBackup(scholarships) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    statuses: getStatusMap(),
    scholarships: scholarships || getCachedList(),
  };
}

export function importBackup(data) {
  if (!data || data.version !== 1) throw new Error("Invalid backup file");
  if (data.statuses) writeJson(STATUS_KEY, data.statuses);
  if (data.scholarships?.length) saveCachedList(data.scholarships);
  return applyStatuses(mergeLists([], data.scholarships || []));
}

/** One-time: pull statuses from server file into localStorage if browser has none. */
export function migrateFromServerRows(scholarships) {
  const map = getStatusMap();
  if (Object.keys(map).length) return;
  let migrated = 0;
  for (const s of scholarships || []) {
    if (!s.url || !s.status || s.status === "Not Started" || s.status === "Failed") continue;
    map[normalizeUrl(s.url)] = {
      status: s.status === "Failed" ? "Not Started" : s.status,
      updatedAt: s.appliedAt || new Date().toISOString(),
    };
    migrated++;
  }
  if (migrated) writeJson(STATUS_KEY, map);
}
