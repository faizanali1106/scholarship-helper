import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { persistScraped } from "./persist.js";
import { updateScrapeJob } from "./scrape-job.js";

const LIST_URLS = [
  "https://diabetesscholars.org/scholarships/",
  "https://www.diabetesscholars.org/scholarships/",
];

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runDiabetesScholarsScrape(options = {}) {
  const headless = options.headless !== false;
  const results = [];

  updateScrapeJob({ message: "Opening Diabetes Scholars Foundation..." });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    let loaded = false;
    for (const url of LIST_URLS.slice(0, 2)) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2000);
        if (page.url().includes("diabetesscholars")) {
          loaded = true;
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!loaded) {
      throw new Error("Could not load diabetesscholars.org scholarships page");
    }

    const entries = await page.evaluate(() => {
      const items = [];
      const seen = new Set();

      const add = (name, url, extra = {}) => {
        if (!name || !url || !url.startsWith("http")) return;
        const key = url.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ name: name.trim(), url, ...extra });
      };

      document.querySelectorAll("a[href]").forEach((a) => {
        const href = a.href;
        const text = a.textContent?.trim() || "";
        if (!text || text.length < 4) return;
        if (/scholar|apply|program|award|grant|diabetes/i.test(text + " " + href)) {
          add(text, href.split("?")[0]);
        }
      });

      document.querySelectorAll("article, .scholarship, [class*='scholar'], li, .card").forEach((el) => {
        const link = el.querySelector("a[href]");
        if (!link) return;
        const name =
          el.querySelector("h1, h2, h3, h4, strong")?.textContent?.trim() ||
          link.textContent?.trim();
        const desc = el.querySelector("p")?.textContent?.trim() || "";
        add(name, link.href.split("?")[0], { description: desc });
      });

      return items;
    });

    updateScrapeJob({ message: `Found ${entries.length} Diabetes Scholars links — fetching details...` });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      updateScrapeJob({
        message: `Diabetes Scholars ${i + 1}/${entries.length}: ${entry.name}`,
      });

      const detail = await context.newPage();
      try {
        await detail.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 40000 });
        await detail.waitForTimeout(1200);

        const meta = await detail.evaluate(() => {
          const pick = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
          const deadline =
            [...document.querySelectorAll("p, span, li, div")]
              .map((el) => el.textContent?.trim())
              .find((t) => t && /deadline|due date|closes/i.test(t)) || "";
          const amount =
            [...document.querySelectorAll("p, span, li, div")]
              .map((el) => el.textContent?.trim())
              .find((t) => t && /\$[\d,]+/.test(t)) || "";
          return {
            title: pick("h1") || pick("h2") || document.title,
            description: pick("article p") || pick("main p") || pick(".content p") || "",
            deadline,
            amount,
          };
        });

        results.push({
          name: clean(meta.title || entry.name),
          url: entry.url,
          description: clean(meta.description || entry.description || ""),
          deadline: clean(meta.deadline),
          amount: clean(meta.amount),
          organization: "Diabetes Scholars Foundation",
          source: "Diabetes Scholars",
          scrapedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          name: clean(entry.name),
          url: entry.url,
          description: clean(entry.description || ""),
          organization: "Diabetes Scholars Foundation",
          source: "Diabetes Scholars",
          scrapedAt: new Date().toISOString(),
        });
      } finally {
        await detail.close();
      }
    }
  } finally {
    await browser.close();
  }

  updateScrapeJob({ message: "Saving Diabetes Scholars results..." });
  const saved = await persistScraped(results, "Diabetes Scholars");

  return {
    site: "diabetes-scholars",
    scraped: results.length,
    synced: saved.added,
    skipped: saved.skipped,
    message: `Saved ${saved.added} Diabetes Scholars entries (${saved.skipped} duplicates skipped)`,
    google: saved.google,
  };
}
