import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { persistScraped } from "./persist.js";
import { updateScrapeJob } from "./scrape-job.js";

const LIST_URL = "https://www.niche.com/colleges/scholarships/";
const STORAGE = path.join(config.root, "data", "niche-state.json");

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function launchContext(headless) {
  const browser = await chromium.launch({ headless });
  const opts = fs.existsSync(STORAGE) ? { storageState: STORAGE } : {};
  const context = await browser.newContext(opts);
  return { browser, context };
}

export async function runNicheScrape(options = {}) {
  const headless = options.headless !== false;
  const maxPages = options.maxPages ?? 5;
  const results = [];

  updateScrapeJob({ message: "Opening Niche scholarships..." });

  const { browser, context } = await launchContext(headless);
  const page = await context.newPage();

  try {
    await page.goto(LIST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const links = await page.evaluate(() => {
      const out = new Set();
      document.querySelectorAll('a[href*="/scholarships/"]').forEach((a) => {
        const href = a.href;
        if (!href || href.includes("#")) return;
        if (/\/scholarships\/?$/.test(href)) return;
        out.add(href.split("?")[0]);
      });
      return [...out];
    });

    const limited = links.slice(0, maxPages * 10);
    updateScrapeJob({ message: `Found ${limited.length} Niche scholarship pages to scrape...` });

    for (let i = 0; i < limited.length; i++) {
      const url = limited[i];
      updateScrapeJob({ message: `Niche ${i + 1}/${limited.length}: ${url}` });

      const detail = await context.newPage();
      try {
        await detail.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await detail.waitForTimeout(1500);

        const data = await detail.evaluate(() => {
          const pick = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
          const title =
            pick("h1") ||
            pick('[class*="scholarship"] h1') ||
            document.title.replace(/\s*\|\s*Niche.*$/i, "");
          const amount =
            pick('[class*="amount"]') ||
            [...document.querySelectorAll("p, span, div")]
              .map((el) => el.textContent?.trim())
              .find((t) => t && /^\$[\d,]+/.test(t)) ||
            "";
          const deadline =
            [...document.querySelectorAll("p, span, div, li")]
              .map((el) => el.textContent?.trim())
              .find((t) => t && /deadline/i.test(t)) || "";
          const description =
            pick('[class*="description"]') ||
            pick("article p") ||
            pick("main p") ||
            "";
          return { title, amount, deadline, description };
        });

        if (data.title) {
          results.push({
            name: clean(data.title),
            amount: clean(data.amount),
            deadline: clean(data.deadline),
            description: clean(data.description),
            url,
            organization: "Niche",
            source: "Niche",
            scrapedAt: new Date().toISOString(),
          });
        }
      } catch {
        /* skip broken page */
      } finally {
        await detail.close();
      }
    }

    await context.storageState({ path: STORAGE }).catch(() => {});
  } finally {
    await browser.close();
  }

  updateScrapeJob({ message: "Saving Niche results..." });
  const saved = await persistScraped(results, "Niche");

  return {
    site: "niche",
    scraped: results.length,
    synced: saved.added,
    skipped: saved.skipped,
    message: `Saved ${saved.added} Niche scholarships (${saved.skipped} duplicates skipped)`,
    google: saved.google,
  };
}
