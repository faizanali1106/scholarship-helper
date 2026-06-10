import { runFastwebScrape } from "./fastweb-sync.js";
import { runNicheScrape } from "./niche.js";
import { runDiabetesScholarsScrape } from "./diabetes-scholars.js";
import {
  startScrapeJob,
  finishScrapeJob,
  failScrapeJob,
  getScrapeJob,
  updateScrapeJob,
} from "./scrape-job.js";

const RUNNERS = {
  fastweb: runFastwebScrape,
  niche: runNicheScrape,
  "diabetes-scholars": runDiabetesScholarsScrape,
};

export function listScraperSites() {
  return [
    { id: "bold", label: "Bold.org", via: "extension", note: "Use Chrome extension → Apply & Scrape" },
    { id: "fastweb", label: "Fastweb.com", via: "dashboard" },
    { id: "niche", label: "Niche.com", via: "dashboard" },
    { id: "diabetes-scholars", label: "Diabetes Scholars Foundation", via: "dashboard" },
  ];
}

export async function runScraperInBackground(site, options = {}) {
  const runner = RUNNERS[site];
  if (!runner) {
    throw new Error(`Unknown scraper: ${site}`);
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

const LUKE_SCRAPE_PLAN = [
  { site: "diabetes-scholars", options: {}, label: "Diabetes Scholars" },
  { site: "niche", options: { maxPages: 4 }, label: "Niche.com" },
  { site: "fastweb", options: { stateNames: ["Ohio Scholarships"], maxStates: null }, label: "Fastweb (Ohio)" },
];

export async function runLukeScrapeInBackground() {
  if (getScrapeJob().running) {
    throw new Error(`Scrape already running for ${getScrapeJob().site}`);
  }

  startScrapeJob("all");

  setImmediate(async () => {
    const totals = { scraped: 0, synced: 0, skipped: 0, sites: [] };
    try {
      for (const step of LUKE_SCRAPE_PLAN) {
        const runner = RUNNERS[step.site];
        if (!runner) continue;
        updateScrapeJob({ message: `Finding scholarships — ${step.label}...`, site: step.site });
        const result = await runner(step.options);
        totals.scraped += result.scraped || 0;
        totals.synced += result.synced || 0;
        totals.skipped += result.skipped || 0;
        totals.sites.push({ site: step.site, ...result });
      }
      finishScrapeJob({
        site: "all",
        message: `Added ${totals.synced} new scholarships matched to your profile (${totals.skipped} duplicates skipped)`,
        scraped: totals.scraped,
        synced: totals.synced,
        skipped: totals.skipped,
        sites: totals.sites,
      });
    } catch (error) {
      failScrapeJob(error);
    }
  });

  return getScrapeJob();
}

export { getScrapeJob };
