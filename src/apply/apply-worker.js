/**
 * Playwright auto-apply worker.
 *
 * For each pending scholarship in the local store it:
 *   1. Opens the application URL in a real browser
 *   2. Autofills the form from the student profile
 *   3. Inserts a (optionally AI-tailored) essay
 *   4. Optionally clicks submit  (mode === "submit")
 *   5. Saves a screenshot + updates status
 *
 * Accuracy notes: scholarship application forms differ wildly and many use
 * CAPTCHA / logins. This worker fills what it can and records the outcome.
 * In "fill" mode it never submits (safe default for review).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { loadProfile, buildAutofillEntries } from "../profile.js";
import { rewriteEssay } from "../essay.js";
import { getPending, updateStatus } from "../store.js";
import { pageFill } from "./page-actions.js";
import {
  startApplyJob,
  updateApplyJob,
  pushApplyResult,
  finishApplyJob,
  failApplyJob,
  getApplyJob,
} from "./apply-job.js";

const SHOT_DIR = path.join(config.root, "data", "apply-screenshots");

function shotPath() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `apply-${Date.now()}.png`);
}

async function applyToOne(context, scholarship, { entries, mode }) {
  const page = await context.newPage();
  const result = {
    name: scholarship.name,
    url: scholarship.url,
    status: "Failed",
    note: "",
    screenshot: "",
  };

  try {
    await page.goto(scholarship.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    let essay = "";
    try {
      essay = await rewriteEssay({
        scholarshipDetails: `${scholarship.name} ${scholarship.description || ""}`.trim(),
        wordLimit: null,
      });
    } catch {
      essay = "";
    }

    const outcome = await page.evaluate(pageFill, {
      entries,
      essay,
      doSubmit: mode === "submit",
    });

    const file = shotPath();
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    result.screenshot = path.relative(config.root, file);

    if (outcome.isLogin) {
      result.status = "Failed";
      result.note = "Login/account required — fill in browser manually";
    } else if (outcome.submitted) {
      result.status = "Submitted";
      result.note = `${outcome.filled} fields filled${outcome.essayInserted ? " + essay" : ""}. ${outcome.submitNote}`;
    } else if (outcome.filled > 0 || outcome.essayInserted) {
      result.status = "Filled";
      result.note =
        `${outcome.filled} fields filled${outcome.essayInserted ? " + essay" : ""}.` +
        (mode === "submit" ? ` ${outcome.submitNote}` : " Review & submit manually.");
    } else {
      result.status = "Failed";
      result.note = `No matching fields found (${outcome.fieldCount} inputs on page)`;
    }
  } catch (error) {
    result.status = "Failed";
    result.note = error.message;
  } finally {
    await page.close().catch(() => {});
  }

  updateStatus(scholarship.url, result.status, {
    applyResult: result.note,
    screenshot: result.screenshot,
  });
  return result;
}

export async function runApply({ mode = "fill", limit = null, headless = true } = {}) {
  const pending = getPending(limit);
  startApplyJob(mode, pending.length);

  if (!pending.length) {
    finishApplyJob();
    return getApplyJob();
  }

  const entries = buildAutofillEntries(loadProfile());
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();

  try {
    for (let i = 0; i < pending.length; i++) {
      updateApplyJob({ message: `Applying ${i + 1}/${pending.length}: ${pending[i].name}` });
      const result = await applyToOne(context, pending[i], { entries, mode });
      pushApplyResult(result);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  finishApplyJob();
  return getApplyJob();
}

export function startApplyInBackground(options = {}) {
  const job = getApplyJob();
  if (job.running) {
    throw new Error("Auto-apply already running");
  }
  const pendingCount = getPending(options.limit).length;
  startApplyJob(options.mode || "fill", pendingCount);

  setImmediate(async () => {
    try {
      await runApply(options);
    } catch (error) {
      failApplyJob(error);
    }
  });

  return getApplyJob();
}

export { getApplyJob };
