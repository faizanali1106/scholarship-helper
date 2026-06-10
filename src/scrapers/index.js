import { runFastwebScrape } from "./fastweb-sync.js";
import { runNicheScrape } from "./niche.js";
import { runDiabetesScholarsScrape } from "./diabetes-scholars.js";
import { listScraperSites } from "./sites.js";
import { isVercel } from "../env.js";
import {
  startScrapeJob,
  finishScrapeJob,
  failScrapeJob,
  getScrapeJob,
  updateScrapeJob,
} from "./scrape-job.js";

export { listScraperSites };

const RUNNERS = {
  fastweb: runFastwebScrape,
  niche: runNicheScrape,
  "diabetes-scholars": runDiabetesScholarsScrape,
};

function lukeScrapePlan() {
  if (isVercel()) {
    return [
      { site: "diabetes-scholars", options: { maxDetails: 0 }, label: "Beyond Scholars (Diabetes)" },
      { site: "niche", options: { maxPages: 2 }, label: "Niche.com" },
      { site: "fastweb", options: { lite: true, maxItems: 12 }, label: "Fastweb (Ohio)" },
    ];
  }
  return [
    { site: "diabetes-scholars", options: {}, label: "Beyond Scholars (Diabetes)" },
    { site: "niche", options: { maxPages: 4 }, label: "Niche.com" },
    { site: "fastweb", options: { stateNames: ["Ohio Scholarships"], maxStates: null }, label: "Fastweb (Ohio)" },
  ];
}

function dedupeItems(items) {
  const byUrl = new Map();
  for (const item of items || []) {
    if (!item?.url) continue;
    const key = item.url.trim().replace(/\/+$/, "").toLowerCase();
    byUrl.set(key, item);
  }
  return [...byUrl.values()];
}

async function runLukeScrapeCore() {
  const totals = { scraped: 0, synced: 0, skipped: 0, sites: [], items: [] };

  const warnings = [];

  for (const step of lukeScrapePlan()) {
    const runner = RUNNERS[step.site];
    if (!runner) continue;
    updateScrapeJob({ message: `Finding scholarships — ${step.label}...`, site: step.site });
    try {
      const result = await runner(step.options);
      totals.scraped += result.scraped || 0;
      totals.synced += result.synced || 0;
      totals.skipped += result.skipped || 0;
      totals.sites.push({ site: step.site, ...result });
      if (result.warning) warnings.push(`${step.label}: ${result.warning}`);
      if (result.items?.length) totals.items.push(...result.items);
    } catch (error) {
      const msg = error.message || String(error);
      warnings.push(`${step.label}: ${msg}`);
      totals.sites.push({
        site: step.site,
        error: msg,
        scraped: 0,
        synced: 0,
        skipped: 0,
        items: [],
      });
    }
  }

  totals.items = dedupeItems(totals.items);

  const baseMsg = `Added ${totals.synced} new scholarships (${totals.skipped} duplicates skipped)`;
  const message =
    warnings.length && totals.synced === 0
      ? `${baseMsg}. Some sources had issues: ${warnings.join("; ")}`
      : warnings.length
        ? `${baseMsg}. Notes: ${warnings.join("; ")}`
        : baseMsg;

  return {
    site: "all",
    message,
    scraped: totals.scraped,
    synced: totals.synced,
    skipped: totals.skipped,
    sites: totals.sites,
    items: totals.items,
    warnings,
  };
}

/** Vercel: run in the same request (job state does not survive across instances). */
export async function runLukeScrapeSync() {
  if (getScrapeJob().running) {
    throw new Error(`Scrape already running for ${getScrapeJob().site}`);
  }
  startScrapeJob("all");
  try {
    const result = await runLukeScrapeCore();
    finishScrapeJob(result);
    return getScrapeJob();
  } catch (error) {
    failScrapeJob(error);
    throw error;
  }
}

export async function runLukeScrapeInBackground() {
  if (getScrapeJob().running) {
    throw new Error(`Scrape already running for ${getScrapeJob().site}`);
  }

  if (isVercel()) {
    return runLukeScrapeSync();
  }

  startScrapeJob("all");

  setImmediate(async () => {
    try {
      const result = await runLukeScrapeCore();
      finishScrapeJob(result);
    } catch (error) {
      failScrapeJob(error);
    }
  });

  return getScrapeJob();
}

export async function runScraperInBackground(site, options = {}) {
  const runner = RUNNERS[site];
  if (!runner) {
    throw new Error(`Unknown scraper: ${site}`);
  }

  if (isVercel()) {
    startScrapeJob(site);
    try {
      const result = await runner(options);
      finishScrapeJob(result);
      return getScrapeJob();
    } catch (error) {
      failScrapeJob(error);
      throw error;
    }
  }

  startScrapeJob(site);

  setImmediate(async () => {
    try {
      const result = await runner(options);
      finishScrapeJob(result);
    } catch (error) {
      failScrapeJob(error);
    }
  });

  return getScrapeJob();
}

export { getScrapeJob };
