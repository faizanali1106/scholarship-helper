import { isVercel } from "../env.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Launch Chromium — serverless binary on Vercel, full Playwright locally. */
export async function launchBrowser(headless = true) {
  if (isVercel()) {
    const chromiumPack = (await import("@sparticuz/chromium")).default;
    const { chromium } = await import("playwright-core");

    if (typeof chromiumPack.setGraphicsMode === "function") {
      chromiumPack.setGraphicsMode(false);
    }

    return chromium.launch({
      args: chromiumPack.args,
      executablePath: await chromiumPack.executablePath(),
      headless: chromiumPack.headless ?? headless,
    });
  }

  const { chromium } = await import("playwright");
  return chromium.launch({ headless });
}

/** Realistic browser context — helps with Cloudflare and redirects. */
export async function newBrowserContext(browser) {
  return browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

export { USER_AGENT };
