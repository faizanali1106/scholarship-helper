import { exec } from "child_process";
import { createApp } from "./create-app.js";
import { isVercel } from "./env.js";

const PORT = Number(process.env.APP_PORT || 3847);
const app = createApp();

function openAppInBrowser() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === "darwin") exec(`open "${url}"`);
  else if (process.platform === "win32") exec(`start "${url}"`);
  else exec(`xdg-open "${url}"`);
}

if (!isVercel()) {
  const server = app.listen(PORT, () => {
    console.log(`\n  Scholarship Hub → http://localhost:${PORT}`);
    console.log(`  Keep this window open while finding scholarships.\n`);
    if (!process.env.SCHOLARSHIP_HELPER_LAUNCHED) {
      openAppInBrowser();
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log("\n  Scholarship Helper is already running.");
      console.log(`  Opening dashboard → http://localhost:${PORT}\n`);
      openAppInBrowser();
      process.exit(0);
    }
    console.error("\n  Failed to start:", err.message);
    process.exit(1);
  });

  process.on("SIGINT", () => process.exit(0));
}

export default app;
