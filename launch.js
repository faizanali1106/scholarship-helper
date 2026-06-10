#!/usr/bin/env node
/**
 * Cross-platform launcher — works on Mac, Windows, and Linux.
 * Usage: node launch.js   OR   npm run launch
 */
import { spawn } from "child_process";
import { execSync } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const PORT = Number(process.env.APP_PORT || 3847);
const URL = `http://localhost:${PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

function log(msg) {
  console.log(msg);
}

function killPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const pids = [
        ...new Set(
          out
            .split("\n")
            .map((l) => l.trim().split(/\s+/).pop())
            .filter((p) => /^\d+$/.test(p))
        ),
      ];
      pids.forEach((pid) => {
        try {
          execSync(`taskkill /PID ${pid} /F`);
        } catch {}
      });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { shell: true });
    }
  } catch {}
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  try {
    execSync(cmd, { shell: true });
  } catch {}
}

function waitForServer(maxMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      http
        .get(`${URL}/api/health`, (res) => {
          if (res.statusCode === 200) resolve(true);
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() - start > maxMs) resolve(false);
      else setTimeout(tick, 400);
    };
    tick();
  });
}

function ensureDeps() {
  // 1. Root dependencies
  if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
    log("\n  First-time setup (1/3): installing app dependencies...\n");
    execSync("npm install", { cwd: ROOT, stdio: "inherit" });
  }

  // 2. Fastweb scraper dependencies
  const fastwebDir = path.join(ROOT, "fastweb");
  if (
    fs.existsSync(path.join(fastwebDir, "package.json")) &&
    !fs.existsSync(path.join(fastwebDir, "node_modules"))
  ) {
    log("\n  First-time setup (2/3): installing scraper dependencies...\n");
    try {
      execSync("npm install", { cwd: fastwebDir, stdio: "inherit" });
    } catch {
      log("  (Fastweb deps install skipped — scraper may need manual setup)");
    }
  }

  // 3. Playwright browser (Chromium) — needed for scraping + auto-apply
  const marker = path.join(ROOT, "data", ".playwright-installed");
  if (!fs.existsSync(marker)) {
    log("\n  First-time setup (3/3): installing browser engine (one-time)...\n");
    try {
      execSync("npx playwright install chromium", { cwd: ROOT, stdio: "inherit" });
      fs.mkdirSync(path.dirname(marker), { recursive: true });
      fs.writeFileSync(marker, new Date().toISOString());
    } catch {
      log("  (Browser install skipped — run 'npx playwright install chromium' if scraping fails)");
    }
  }
}

async function main() {
  console.log("\n  ╔══════════════════════════════════════╗");
  console.log("  ║       SCHOLARSHIP HELPER             ║");
  console.log("  ╚══════════════════════════════════════╝\n");

  ensureDeps();

  killPort(PORT);
  await new Promise((r) => setTimeout(r, 500));

  log("  Starting app...");
  log(`  Dashboard → ${URL}\n`);
  log("  ⚠️  Keep this window open while applying.\n");

  const child = spawn(process.execPath, ["src/app-server.js"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, SCHOLARSHIP_HELPER_LAUNCHED: "1" },
  });

  const ready = await waitForServer();
  if (ready) openBrowser(URL);

  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error("  Failed to start:", err.message);
  process.exit(1);
});
