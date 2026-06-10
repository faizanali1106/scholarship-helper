import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { config } from "../config.js";
import { persistScraped } from "./persist.js";
import { updateScrapeJob } from "./scrape-job.js";

const require = createRequire(import.meta.url);
const FASTWEB_DIR = path.join(config.root, "fastweb");

function csvPath() {
  return path.join(FASTWEB_DIR, "fastweb_scholarships.csv");
}

function parseFastwebCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const records = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
  return records.map((row) => ({
    name: row.Title || row.title || "",
    organization: row.Provider || row.provider || "",
    amount: row.Amount || row.amount || "",
    deadline: row.Deadline || row.deadline || "",
    description: row.Description || row.description || "",
    url: row["Apply Link"] || row["Apply link"] || row.url || "",
    state: row.State || row.state || "",
    source: "Fastweb",
    scrapedAt: new Date().toISOString(),
  }));
}

export async function runFastwebScrape(options = {}) {
  const headless = options.headless !== false;
  const maxStates = options.maxStates ?? 3;
  const csvFile = csvPath();

  updateScrapeJob({ message: "Launching Fastweb browser (Playwright)..." });

  const FastwebScraper = require(path.join(FASTWEB_DIR, "scraper_fastweb.js"));
  const scraper = new FastwebScraper();

  updateScrapeJob({
    message:
      maxStates != null
        ? `Scraping Fastweb (up to ${maxStates} states)...`
        : "Scraping Fastweb (all states — may take a long time)...",
  });

  const scrapeResult = await scraper.scrapeFastweb(csvFile, headless, {
    maxStates,
    stateNames: options.stateNames,
  });

  if (!fs.existsSync(csvFile)) {
    throw new Error(scrapeResult.errors?.[0] || "Fastweb scrape produced no CSV file");
  }

  updateScrapeJob({ message: "Saving Fastweb results..." });

  const items = parseFastwebCsv(csvFile).filter((i) => i.url && i.url.startsWith("http"));
  const saved = await persistScraped(items, "Fastweb");

  return {
    site: "fastweb",
    scraped: scrapeResult.total_scraped || items.length,
    synced: saved.added,
    skipped: saved.skipped,
    statesProcessed: scrapeResult.states_processed || 0,
    csvFile: "fastweb/fastweb_scholarships.csv",
    message: `Saved ${saved.added} Fastweb scholarships (${saved.skipped} duplicates skipped)`,
    google: saved.google,
    errors: scrapeResult.errors || [],
  };
}
