import * as cheerio from "cheerio";
import { launchBrowser, newBrowserContext, USER_AGENT } from "./browser.js";
import { persistScraped } from "./persist.js";
import { updateScrapeJob } from "./scrape-job.js";
import { isVercel } from "../env.js";

/** diabetesscholars.org now redirects to Beyond Type 1's Beyond Scholars program. */
const LIST_URLS = [
  "https://beyondtype1.org/beyond-scholars/",
  "https://diabetesscholars.org/scholarships/",
];

const DIABETES_LINK_SEARCH = "https://thediabeteslink.org/find-answers/search-scholarships";

const CURATED = [
  {
    name: "Beyond Scholars — Beyond Type 1 Scholarship Program",
    url: "https://beyondtype1.org/beyond-scholars/",
    description:
      "Scholarship program for the diabetes community. Beyond Type 1 points students to The Diabetes Link for current college scholarship listings.",
    organization: "Beyond Type 1",
    source: "Diabetes Scholars",
  },
  {
    name: "The Diabetes Link — Scholarship Search",
    url: DIABETES_LINK_SEARCH,
    description:
      "Searchable directory of diabetes-related college scholarships (successor to Diabetes Scholars Foundation listings).",
    organization: "The Diabetes Link",
    source: "Diabetes Scholars",
  },
];

function clean(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function isScholarshipHost(url) {
  return /beyondtype1\.org|diabetesscholars\.org|thediabeteslink\.org/i.test(url);
}

function dedupeItems(items) {
  const byUrl = new Map();
  for (const item of items || []) {
    if (!item?.url) continue;
    const key = normalizeUrl(item.url);
    if (!byUrl.has(key)) byUrl.set(key, item);
  }
  return [...byUrl.values()];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  return res.text();
}

function parseBeyondScholarsHtml(html, finalUrl) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  const skipLink = (name, url) => {
    const n = name.toLowerCase();
    const u = url.toLowerCase();
    if (/^(english|español|espanol)$/i.test(name)) return true;
    if (/\/es\//.test(u)) return true;
    if (u === "https://thediabeteslink.org" || u === "https://thediabeteslink.org/") return true;
    if (u === "https://beyondtype1.org" || u === "https://beyondtype1.org/") return true;
    return false;
  };

  const add = (name, url, extra = {}) => {
    const cleanUrl = clean(url).split("#")[0];
    if (!name || !cleanUrl || !cleanUrl.startsWith("http")) return;
    if (skipLink(name, cleanUrl)) return;
    const key = normalizeUrl(cleanUrl);
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      name: clean(name),
      url: cleanUrl,
      organization: extra.organization || "Beyond Type 1",
      description: clean(extra.description || ""),
      source: "Diabetes Scholars",
      scrapedAt: new Date().toISOString(),
      ...extra,
    });
  };

  const pageTitle = clean($("h1").first().text()) || "Beyond Scholars";
  const metaDesc = clean($('meta[name="description"]').attr("content") || "");
  add(
    metaDesc ? `Beyond Scholars — ${pageTitle}` : "Beyond Scholars — Beyond Type 1 Scholarship Program",
    finalUrl.includes("beyondtype1") ? finalUrl : "https://beyondtype1.org/beyond-scholars/",
    { description: metaDesc || CURATED[0].description }
  );

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (!text || text.length < 4) return;
    const absolute = href.startsWith("http") ? href : new URL(href, finalUrl).href;
    if (!isScholarshipHost(absolute)) return;
    const blob = `${text} ${absolute}`;
    if (/scholar|grant|apply|funding|diabetes link|beyond scholar/i.test(blob)) {
      const label =
        absolute.includes("search-scholarships")
          ? "The Diabetes Link — Scholarship Search"
          : text;
      add(label, absolute, {
        organization: absolute.includes("thediabeteslink") ? "The Diabetes Link" : "Beyond Type 1",
      });
    }
  });

  return results;
}

async function scrapeViaFetch() {
  for (const url of LIST_URLS) {
    try {
      updateScrapeJob({ message: `Fetching ${url}...` });
      const html = await fetchHtml(url);
      if (!html) continue;
      if (/beyond.?scholar|diabetes.?scholar|beyondtype1/i.test(html)) {
        const finalUrl = url.includes("diabetesscholars")
          ? "https://beyondtype1.org/beyond-scholars/"
          : url;
        const items = parseBeyondScholarsHtml(html, finalUrl);
        if (items.length) return items;
      }
    } catch {
      /* try next URL */
    }
  }
  return [];
}

async function scrapeViaBrowser(headless) {
  const browser = await launchBrowser(headless);
  const context = await newBrowserContext(browser);
  const page = await context.newPage();

  try {
    for (const url of LIST_URLS) {
      try {
        updateScrapeJob({ message: `Opening ${url}...` });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2500);

        const finalUrl = page.url();
        if (!isScholarshipHost(finalUrl) && !/beyond.?scholar/i.test(await page.title())) {
          continue;
        }

        const html = await page.content();
        const items = parseBeyondScholarsHtml(html, finalUrl);
        if (items.length) return items;
      } catch {
        /* try next */
      }
    }
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeDiabetesLinkBrowser(headless, maxItems = 8) {
  const browser = await launchBrowser(headless);
  const context = await newBrowserContext(browser);
  const page = await context.newPage();
  const results = [];

  try {
    updateScrapeJob({ message: "Opening The Diabetes Link scholarship search..." });
    await page.goto(DIABETES_LINK_SEARCH, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    if (page.url().includes("403") || (await page.title()).toLowerCase().includes("forbidden")) {
      return [];
    }

    const links = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = a.href?.split("?")[0];
        const text = a.textContent?.trim() || "";
        if (!href || !text || text.length < 4 || seen.has(href)) return;
        if (/scholar|grant|apply|award|fellowship/i.test(text + " " + href)) {
          seen.add(href);
          out.push({ name: text, url: href });
        }
      });
      return out;
    });

    const limited = links.slice(0, maxItems);
    for (let i = 0; i < limited.length; i++) {
      const link = limited[i];
      if (normalizeUrl(link.url) === normalizeUrl(DIABETES_LINK_SEARCH)) continue;

      updateScrapeJob({
        message: `Diabetes Link ${i + 1}/${limited.length}: ${link.name.slice(0, 50)}`,
      });

      const detail = await context.newPage();
      try {
        await detail.goto(link.url, { waitUntil: "domcontentloaded", timeout: 40000 });
        await detail.waitForTimeout(1200);
        const meta = await detail.evaluate(() => ({
          title: document.querySelector("h1")?.textContent?.trim() || document.title,
          description:
            document.querySelector("article p, main p, .content p")?.textContent?.trim() || "",
        }));
        results.push({
          name: clean(meta.title || link.name),
          url: link.url,
          description: clean(meta.description),
          organization: "The Diabetes Link",
          source: "Diabetes Scholars",
          scrapedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          name: clean(link.name),
          url: link.url,
          organization: "The Diabetes Link",
          source: "Diabetes Scholars",
          scrapedAt: new Date().toISOString(),
        });
      } finally {
        await detail.close();
      }
    }
  } catch {
    /* Diabetes Link may block bots — curated entries still apply */
  } finally {
    await browser.close();
  }

  return results;
}

async function runDiabetesScholarsScrapeCore(options = {}) {
  const headless = options.headless !== false;
  const maxDetails = options.maxDetails ?? (isVercel() ? 8 : 20);
  let warning = null;

  updateScrapeJob({ message: "Finding diabetes scholarships (Beyond Scholars)..." });

  let results = await scrapeViaFetch();

  if (!results.length) {
    updateScrapeJob({ message: "Fetch failed — trying browser..." });
    results = await scrapeViaBrowser(headless);
  }

  if (!results.length) {
    updateScrapeJob({ message: "Using curated diabetes scholarship links..." });
    warning = "Live page unavailable — using backup diabetes scholarship links.";
    results = CURATED.map((item) => ({
      ...item,
      scrapedAt: new Date().toISOString(),
    }));
  }

  if (maxDetails > 0) {
    try {
      const extra = await scrapeDiabetesLinkBrowser(headless, isVercel() ? 5 : maxDetails);
      if (extra.length) results.push(...extra);
      else if (!warning) {
        warning =
          "The Diabetes Link blocks automated access — open “Scholarship Search” in the list to browse fresh listings.";
      }
    } catch {
      if (!warning) {
        warning =
          "Could not auto-scrape The Diabetes Link — use the Scholarship Search link in your list.";
      }
    }
  }

  results = dedupeItems(results);

  updateScrapeJob({ message: "Saving diabetes scholarship results..." });
  const saved = await persistScraped(results, "Diabetes Scholars");

  return {
    site: "diabetes-scholars",
    scraped: results.length,
    synced: saved.added,
    skipped: saved.skipped,
    items: results,
    message: `Saved ${saved.added} diabetes scholarships (${saved.skipped} duplicates skipped)`,
    warning,
    google: saved.google,
  };
}

/** Never throws — diabetes scrape must not block Niche/Fastweb. */
export async function runDiabetesScholarsScrape(options = {}) {
  try {
    return await runDiabetesScholarsScrapeCore(options);
  } catch (error) {
    const results = CURATED.map((item) => ({
      ...item,
      scrapedAt: new Date().toISOString(),
    }));
    const saved = await persistScraped(results, "Diabetes Scholars");
    return {
      site: "diabetes-scholars",
      scraped: results.length,
      synced: saved.added,
      skipped: saved.skipped,
      items: results,
      message: `Saved ${saved.added} backup diabetes links (${saved.skipped} duplicates skipped)`,
      warning: error.message || String(error),
      google: saved.google,
    };
  }
}
