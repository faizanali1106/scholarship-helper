import { launchBrowser } from "./browser.js";
import { persistScraped } from "./persist.js";
import { updateScrapeJob } from "./scrape-job.js";
import { isVercel } from "../env.js";

const OHIO_URL = "https://www.fastweb.com/directory/ohio-scholarships";

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runFastwebLiteScrape(options = {}) {
  const maxItems = options.maxItems ?? (isVercel() ? 12 : 25);
  const results = [];

  updateScrapeJob({ message: "Opening Fastweb (Ohio)..." });

  const browser = await launchBrowser(options.headless !== false);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(OHIO_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const links = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      document.querySelectorAll("tbody.scholarship_wrap a, .scholarship_wrap a, a[href*='/college-scholarships/scholarships/']").forEach((a) => {
        const href = a.href?.split("?")[0];
        const name = a.textContent?.trim();
        if (!href || !name || name.length < 4) return;
        if (seen.has(href)) return;
        seen.add(href);
        out.push({ name, url: href });
      });
      return out;
    });

    const limited = links.slice(0, maxItems);
    updateScrapeJob({ message: `Fastweb: fetching ${limited.length} Ohio scholarships...` });

    for (let i = 0; i < limited.length; i++) {
      const link = limited[i];
      updateScrapeJob({ message: `Fastweb ${i + 1}/${limited.length}: ${link.name}` });

      const detail = await context.newPage();
      try {
        await detail.goto(link.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await detail.waitForTimeout(1000);

        const meta = await detail.evaluate(() => {
          const pick = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
          return {
            title: pick("h1.award-name") || pick("h1") || document.title,
            provider: pick("p.award-provider") || pick("a.award-provider") || "",
            amount: pick("div.award-amount-wrapper p") || pick(".award-amount-wrapper .award-info") || "",
            deadline: pick("div.award-deadline-wrapper p") || "",
            description: pick("p.award-description") || pick(".award-description") || "",
          };
        });

        results.push({
          name: clean(meta.title || link.name),
          organization: clean(meta.provider) || "Fastweb",
          amount: clean(meta.amount),
          deadline: clean(meta.deadline) || "Varies",
          description: clean(meta.description),
          url: link.url,
          state: "Ohio",
          source: "Fastweb",
          scrapedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          name: clean(link.name),
          url: link.url,
          state: "Ohio",
          source: "Fastweb",
          scrapedAt: new Date().toISOString(),
        });
      } finally {
        await detail.close();
      }
    }
  } finally {
    await browser.close();
  }

  updateScrapeJob({ message: "Saving Fastweb results..." });
  const saved = await persistScraped(results, "Fastweb");

  return {
    site: "fastweb",
    scraped: results.length,
    synced: saved.added,
    skipped: saved.skipped,
    items: results,
    message: `Saved ${saved.added} Fastweb scholarships (${saved.skipped} duplicates skipped)`,
    google: saved.google,
  };
}
