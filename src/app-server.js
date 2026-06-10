import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import fs from "fs";
import { loadScholarships, listTrackerSummary, testTrackerConnection } from "./tracker.js";
import { buildAutofillEntries, loadProfile } from "./profile.js";
import { rewriteEssay, countWords, loadMasterEssay } from "./essay.js";
import { queue, extractEssayContextFromText } from "./queue.js";
import { config } from "./config.js";
import { loadSettings, saveSettings, maskSettings, getOpenAiKey, getOpenAiKeyInfo } from "./settings.js";
import {
  runScraperInBackground,
  runLukeScrapeInBackground,
  getScrapeJob,
  listScraperSites,
} from "./scrapers/index.js";
import { getAll as storeGetAll, getSummary as storeGetSummary, clearAll as storeClear, updateStatus as storeUpdateStatus, resetFailed as storeResetFailed } from "./store.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.APP_PORT || 3847);
const app = express();

app.use(express.json({ limit: "5mb" }));

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "../public")));
app.use("/screenshots", express.static(path.join(__dirname, "../data/apply-screenshots")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get("/api/status", (_req, res) => {
  res.json({ queue: queue.getStatus() });
});

app.get("/api/settings", (_req, res) => {
  res.json(maskSettings(loadSettings()));
});

app.post("/api/settings", (req, res) => {
  try {
    const saved = saveSettings(req.body);
    res.json(maskSettings(saved));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/settings/test-tracker", async (_req, res) => {
  try {
    const result = await testTrackerConnection();
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/upload/tracker", (req, res) => {
  try {
    const { data, filename } = req.body;
    if (!data) return res.status(400).json({ error: "No file data" });
    const dest = path.join(config.root, "data", "tracker.xlsx");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(data, "base64"));
    saveSettings({ trackerType: "excel", excelPath: "data/tracker.xlsx" });
    res.json({ ok: true, path: "data/tracker.xlsx", filename: filename || "tracker.xlsx" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/info", async (_req, res) => {
  try {
    const profile = loadProfile();
    const settings = loadSettings();
    let scholarships = [];
    let sheets = [];
    let trackerReady = false;
    try {
      scholarships = await loadScholarships();
      sheets = await listTrackerSummary();
      trackerReady = scholarships.length > 0;
    } catch {
      /* tracker not configured yet */
    }
    const keyInfo = getOpenAiKeyInfo();
    res.json({
      profileName: profile.fullName,
      scholarshipCount: scholarships.length,
      sheets,
      hasOpenAiKey: keyInfo.configured,
      openAiKeySource: keyInfo.source,
      setupComplete: settings.setupComplete,
      trackerType: settings.trackerType,
      trackerReady,
      port: PORT,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/profile", (_req, res) => {
  try {
    const profile = loadProfile();
    res.json({ profile, entries: buildAutofillEntries(profile) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/essay/toolkit", (_req, res) => {
  try {
    const anglesPath = path.join(config.root, "data", "essay-angles.json");
    const master = loadMasterEssay();
    const angles = JSON.parse(fs.readFileSync(anglesPath, "utf8"));
    res.json({ master, wordCount: countWords(master), angles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/essay", async (req, res) => {
  try {
    const { pageText, url } = req.body;
    const { scholarshipDetails, wordLimit } = extractEssayContextFromText(pageText || "");
    const essay = await rewriteEssay({ scholarshipDetails, wordLimit });
    res.json({
      essay,
      wordCount: countWords(essay),
      wordLimit,
      usedAi: Boolean(getOpenAiKey()),
      url,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/queue", (_req, res) => {
  res.json(queue.getStatus());
});

app.post("/api/queue/start", async (req, res) => {
  try {
    const limit = req.body.limit != null ? Number(req.body.limit) : null;
    const sheet = req.body.sheet || null;
    const status = await queue.start({ limit, sheet });
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/queue/mark", async (req, res) => {
  try {
    const { action, url } = req.body;
    if (!["submitted", "skip", "progress"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }
    const status = await queue.mark(action, url);
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/queue/reset", (_req, res) => {
  queue.reset();
  res.json(queue.getStatus());
});

app.get("/api/scrape/sites", (_req, res) => {
  res.json({ sites: listScraperSites() });
});

app.get("/api/scrape/status", (_req, res) => {
  res.json(getScrapeJob());
});

app.post("/api/scrape/find-for-luke", async (_req, res) => {
  try {
    const job = getScrapeJob();
    if (job.running) {
      return res.status(409).json({ error: `Scrape already running (${job.site})` });
    }
    const status = await runLukeScrapeInBackground();
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/scrape/:site", async (req, res) => {
  try {
    const site = req.params.site;
    if (site === "bold") {
      return res.status(400).json({
        error: "Bold.org is scraped from the Chrome extension (Apply & Scrape).",
      });
    }
    const job = getScrapeJob();
    if (job.running) {
      return res.status(409).json({ error: `Scrape already running for ${job.site}` });
    }
    const options = {
      maxStates: req.body.maxStates,
      maxPages: req.body.maxPages,
      headless: req.body.headless !== false,
    };
    if (req.body.quick) {
      if (site === "fastweb") options.maxStates = 3;
      if (site === "niche") options.maxPages = 2;
    }
    if (req.body.full && site === "fastweb") options.maxStates = null;
    if (req.body.stateNames) options.stateNames = req.body.stateNames;

    const status = await runScraperInBackground(site, options);
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/scrape/:site/start-queue", async (req, res) => {
  try {
    const settings = loadSettings();
    const status = await queue.start({
      limit: req.body.limit ?? null,
      sheet: settings.masterSheetName || "Master Tracker",
    });
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Local scholarship store ----
app.get("/api/scholarships", (_req, res) => {
  res.json({ summary: storeGetSummary(), scholarships: storeGetAll() });
});

app.post("/api/scholarships/clear", (_req, res) => {
  storeClear();
  res.json({ ok: true, summary: storeGetSummary() });
});

app.post("/api/scholarships/status", (req, res) => {
  try {
    const { url, status } = req.body;
    const allowed = ["Not Started", "In Progress", "Submitted", "Skipped"];
    if (!url || !allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid url or status" });
    }
    const ok = storeUpdateStatus(url, status);
    if (!ok) return res.status(404).json({ error: "Scholarship not found" });
    res.json({ ok: true, summary: storeGetSummary() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/scholarships/reset-failed", (_req, res) => {
  const count = storeResetFailed();
  res.json({ ok: true, reset: count, summary: storeGetSummary() });
});

function openAppInBrowser() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === "darwin") exec(`open "${url}"`);
  else if (process.platform === "win32") exec(`start "${url}"`);
  else exec(`xdg-open "${url}"`);
}

const server = app.listen(PORT, () => {
  console.log(`\n  Scholarship Hub → http://localhost:${PORT}`);
  console.log(`  Keep this window open while finding scholarships.\n`);
  if (!process.env.SCHOLARSHIP_HELPER_LAUNCHED) {
    openAppInBrowser();
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("\n  Scholarship Helper is already running.");
    console.log(`  Opening dashboard → http://localhost:${PORT}\n`);
    openAppInBrowser();
    process.exit(0);
  }
  console.error("\n  Failed to start:", err.message);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
