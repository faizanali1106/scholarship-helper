import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { loadScholarships, listTrackerSummary, testTrackerConnection } from "./tracker.js";
import { buildAutofillEntries, loadProfile } from "./profile.js";
import { rewriteEssay, countWords, loadMasterEssay } from "./essay.js";
import { queue, extractEssayContextFromText } from "./queue.js";
import { config } from "./config.js";
import { loadSettings, saveSettings, maskSettings, getOpenAiKey, getOpenAiKeyInfo } from "./settings.js";
import { getScrapeJob } from "./scrapers/scrape-job.js";
import { listScraperSites } from "./scrapers/sites.js";
import {
  getAll as storeGetAll,
  getSummary as storeGetSummary,
  clearAll as storeClear,
  updateStatus as storeUpdateStatus,
  resetFailed as storeResetFailed,
} from "./store.js";
import { isVercel } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.APP_PORT || 3847);

async function loadScrapers() {
  return import("./scrapers/index.js");
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "5mb" }));

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Static UI (local dev; on Vercel, public/ is served by the platform)
  if (!isVercel()) {
    app.use(express.static(path.join(__dirname, "../public")));
    app.use("/screenshots", express.static(path.join(__dirname, "../data/apply-screenshots")));
  }

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      port: PORT,
      vercel: isVercel(),
      scrapeAvailable: true,
      scrapeVersion: 2,
    });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ queue: queue.getStatus() });
  });

  app.get("/api/settings", (_req, res) => {
    res.json(maskSettings(loadSettings()));
  });

  app.post("/api/settings", (req, res) => {
    if (isVercel()) {
      return res.status(503).json({ error: "Settings are read-only on the hosted app." });
    }
    try {
      const saved = saveSettings(req.body);
      res.json(maskSettings(saved));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/settings/test-tracker", async (_req, res) => {
    if (isVercel()) {
      return res.status(503).json({ error: "Google Sheets sync is not available on Vercel." });
    }
    try {
      const result = await testTrackerConnection();
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/upload/tracker", (req, res) => {
    if (isVercel()) {
      return res.status(503).json({ error: "File upload is not available on Vercel." });
    }
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
        /* tracker not configured */
      }
      const keyInfo = getOpenAiKeyInfo();
      const store = storeGetAll();
      res.json({
        profileName: profile.fullName,
        scholarshipCount: store.length || scholarships.length,
        sheets,
        hasOpenAiKey: keyInfo.configured,
        openAiKeySource: keyInfo.source,
        setupComplete: true,
        trackerType: settings.trackerType,
        trackerReady: trackerReady || store.length > 0,
        port: PORT,
        vercel: isVercel(),
        scrapeAvailable: true,
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
    if (isVercel()) {
      return res.status(503).json({ error: "Apply queue is not available on Vercel." });
    }
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
    if (isVercel()) {
      return res.json({ ok: true, note: "Status saved in your browser on Vercel." });
    }
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
    if (isVercel()) return res.json({ ok: true });
    queue.reset();
    res.json(queue.getStatus());
  });

  app.get("/api/scrape/sites", (_req, res) => {
    res.json({ sites: listScraperSites(), scrapeAvailable: true });
  });

  app.get("/api/scrape/status", (_req, res) => {
    res.json({ ...getScrapeJob(), scrapeAvailable: true });
  });

  app.post("/api/scrape/find-for-luke", async (_req, res) => {
    try {
      const { runLukeScrapeInBackground, getScrapeJob: getJob } = await loadScrapers();
      const job = getJob();
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
      const { runScraperInBackground, getScrapeJob: getJob } = await loadScrapers();
      const job = getJob();
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
      if (site === "fastweb" && (isVercel() || req.body.ohio || req.body.lite)) {
        options.lite = true;
      }

      const status = await runScraperInBackground(site, options);
      res.json(status);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/scrape/:site/start-queue", async (req, res) => {
    if (isVercel()) {
      return res.status(503).json({ error: "Apply queue is not available on the hosted app." });
    }
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

  app.get("/api/scholarships", (_req, res) => {
    res.json({ summary: storeGetSummary(), scholarships: storeGetAll() });
  });

  app.post("/api/scholarships/clear", (_req, res) => {
    if (isVercel()) {
      return res.json({
        ok: true,
        note: "Clear the list via Restore backup or clear browser storage locally.",
      });
    }
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
      if (isVercel()) {
        return res.json({ ok: true, vercel: true, note: "Status stored in your browser." });
      }
      const ok = storeUpdateStatus(url, status);
      if (!ok) return res.status(404).json({ error: "Scholarship not found" });
      res.json({ ok: true, summary: storeGetSummary() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/scholarships/reset-failed", (_req, res) => {
    if (isVercel()) return res.json({ ok: true, reset: 0 });
    const count = storeResetFailed();
    res.json({ ok: true, reset: count, summary: storeGetSummary() });
  });

  return app;
}
