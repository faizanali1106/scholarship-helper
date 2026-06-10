const API = "http://localhost:3847";

const STATE_ICONS = {
  manual: "🧭",
  need_login: "🔐",
  submitted: "🎉",
};

async function api(path, options) {
  const res = await fetch(`${API}${path}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToPage(message) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("No page open");
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error("Refresh the page, then try Fill This Page again");
  }
}

function $(id) {
  return document.getElementById(id);
}

function setConnected(ok) {
  $("connDot").className = "dot " + (ok ? "on" : "off");
  $("connText").textContent = ok ? "Connected" : "Not connected";
  $("offlineHelp").classList.toggle("hidden", ok);

  const disabled = !ok;
  $("btnFillAll").disabled = disabled;
  $("btnDone").disabled = disabled;
  $("btnOpen").disabled = disabled;
  $("btnSkip").disabled = disabled;
  $("btnOpenUrl").disabled = disabled;
}

function renderQueue(q) {
  if (!q) return;
  const pct = q.total ? Math.round((q.index / q.total) * 100) : 0;
  $("progressBar").style.width = `${pct}%`;
  $("progressPct").textContent = `${pct}%`;
  $("progressLabel").textContent = q.total
    ? `${q.index} of ${q.total} done`
    : "Start queue from dashboard";
  $("currentName").textContent = q.current?.name || "—";
  $("currentUrl").textContent =
    q.current?.website || "Use Open From List or paste a link";
}

function renderGuide(analysis) {
  const state = analysis?.state || "manual";
  $("guideCard").className = `guide-card state-${state}`;
  $("guideIcon").textContent = STATE_ICONS[state] || "🧭";
  $("guideTitle").textContent = analysis?.title || "You navigate, we fill";
  $("guideMessage").textContent =
    analysis?.message ||
    "Navigate to the application form yourself, then click Fill This Page.";

  $("btnContinue").classList.toggle("hidden", state !== "need_login");

  if (state === "need_login") {
    $("fillSub").textContent = "Log in first, then open the form";
    $("btnFillAll").disabled = true;
  } else if ($("connDot").classList.contains("on")) {
    $("fillSub").textContent = "Fills the page you are looking at now";
    $("btnFillAll").disabled = false;
  }
}

async function analyzeCurrentPage() {
  try {
    const res = await sendToPage({ type: "ANALYZE_PAGE" });
    if (res?.analysis) renderGuide(res.analysis);
    return res?.analysis;
  } catch {
    renderGuide({
      state: "manual",
      title: "You navigate, we fill",
      message:
        "Go to the application form in Chrome, then click Fill This Page.",
    });
    return null;
  }
}

async function refresh() {
  try {
    const ping = await fetch(`${API}/api/health`);
    if (!ping.ok) throw new Error();
    setConnected(true);
    const status = await api("/api/status");
    renderQueue(status.queue || {});

    const stored = await chrome.storage.session.get(["pageAnalysis"]);
    if (stored.pageAnalysis) renderGuide(stored.pageAnalysis);
    else await analyzeCurrentPage();
    return status;
  } catch {
    setConnected(false);
    return null;
  }
}

async function fillThisPage() {
  const analysis = await analyzeCurrentPage();
  if (analysis?.state === "need_login") {
    $("lastAction").textContent = "Log in first, then navigate to the form.";
    return;
  }

  $("lastAction").textContent = "Filling this page...";
  $("btnFillAll").disabled = true;

  const { entries } = await api("/api/profile");
  const page = await sendToPage({ type: "PAGE_TEXT" });
  const essayData = await api("/api/essay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageText: page.text, url: page.url }),
  });

  const result = await sendToPage({
    type: "FILL_ALL",
    entries,
    essay: essayData.essay,
  });

  $("btnFillAll").disabled = false;

  if (!result.ok) {
    $("lastAction").textContent = result.error || "Could not fill this page.";
    return;
  }

  $("lastAction").textContent = `Filled ${result.filled} fields${result.essayInserted ? " + essay" : ""}. Review, submit on the site, then I'm Done.`;
}

async function markDone() {
  const tab = await activeTab();
  await api("/api/queue/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submitted", url: tab?.url }),
  });
  $("lastAction").textContent = "Saved! Opening next from list...";
  await refresh();
  await openFromList();
}

async function markSkip() {
  const tab = await activeTab();
  await api("/api/queue/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "skip", url: tab?.url }),
  });
  $("lastAction").textContent = "Skipped.";
  await refresh();
  await openFromList();
}

async function openFromList() {
  const q = await api("/api/queue");
  if (!q.current?.website) {
    $("lastAction").textContent = "Queue empty — paste a link or start from dashboard.";
    return;
  }
  await api("/api/queue/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "progress", url: q.current.website }),
  });
  await chrome.tabs.create({ url: q.current.website });
  $("lastAction").textContent = "Opened — navigate to the form, then Fill This Page.";
  renderGuide({
    state: "manual",
    title: "Navigate to the form",
    message: "Log in if needed, open the application form, then click Fill This Page.",
  });
  setTimeout(analyzeCurrentPage, 2000);
}

async function openPastedUrl() {
  const url = $("urlInput").value.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    $("lastAction").textContent = "Paste a valid link starting with https://";
    return;
  }
  await chrome.tabs.create({ url });
  $("urlInput").value = "";
  $("lastAction").textContent = "Link opened — go to the form, then Fill This Page.";
  renderGuide({
    state: "manual",
    title: "Navigate to the form",
    message: "When the application form is on screen, click Fill This Page.",
  });
  setTimeout(analyzeCurrentPage, 2000);
}

async function onContinue() {
  $("lastAction").textContent = "OK — navigate to the application form, then Fill This Page.";
  await analyzeCurrentPage();
}

/**
 * Bold.org Automation Workflow
 */
async function startBoldAutomation() {
  const email = $("boldEmail")?.value?.trim();
  const password = $("boldPassword")?.value?.trim();

  if (!email || !password) {
    $("lastAction").textContent = "Please enter email and password";
    return;
  }

  // Hide form, show progress
  const emailInput = $("boldEmail");
  const passwordInput = $("boldPassword");
  const progressDiv = $("workflowProgress");
  const successDiv = $("successSection");

  emailInput.disabled = true;
  passwordInput.disabled = true;
  $("btnApply").disabled = true;
  progressDiv.classList.remove("hidden");
  successDiv.classList.add("hidden");

  // Reset all steps
  for (let i = 1; i <= 6; i++) {
    const el = $(`step${i}Status`);
    if (el) el.textContent = "⏳";
    const step = document.querySelector(`.progress-steps .progress-step:nth-child(${i})`);
    if (step) step.classList.remove("active", "done");
  }

  const currentProgressEl = $("currentProgress");

  try {
    // Send workflow start message to background script
    const response = await chrome.runtime.sendMessage({
      type: "BOLD_START_WORKFLOW",
      email,
      password
    });

    if (!response.ok) {
      throw new Error(response.error || "Workflow failed");
    }

    const sync = response.googleSheetsSync;
    if (sync && !sync.success) {
      throw new Error(
        sync.error ||
          "Scraped scholarships but Google Sheet sync failed. Redeploy Apps Script with the latest code."
      );
    }

    // Mark all steps as complete
    for (let i = 1; i <= 6; i++) {
      const el = $(`step${i}Status`);
      if (el) el.textContent = "✓";
      const step = document.querySelector(`.progress-steps .progress-step:nth-child(${i})`);
      if (step) {
        step.classList.add("done");
        step.classList.remove("active");
      }
    }

    currentProgressEl.textContent = `✅ Complete! Scraped ${response.scholarshipCount} scholarships`;
    currentProgressEl.style.background = "#dcfce7";
    currentProgressEl.style.borderLeftColor = "#22c55e";
    currentProgressEl.style.color = "#166534";

    // Show success section
    showSuccessSection(response);

  } catch (error) {
    $("lastAction").textContent = `✗ Error: ${error.message}`;
    currentProgressEl.textContent = `❌ Error: ${error.message}`;
    currentProgressEl.style.background = "#fee2e2";
    currentProgressEl.style.borderLeftColor = "#dc2626";
    currentProgressEl.style.color = "#991b1b";

  } finally {
    emailInput.disabled = false;
    passwordInput.disabled = false;
    $("btnApply").disabled = false;
  }
}

/**
 * Show success section with Google Sheet link and next steps
 */
async function showSuccessSection(response) {
  const successDiv = $("successSection");
  const successMsg = $("successMessage");
  const sheetLink = $("googleSheetLink");

  // Get Google Sheet URL from response or settings
  let googleSheetUrl = response.googleSheetUrl || "";
  
  if (!googleSheetUrl) {
    try {
      const result = await fetch("http://localhost:3847/api/settings");
      const settings = await result.json();
      googleSheetUrl = settings.googleSheetUrl || settings.googleAppsScriptUrl;
    } catch (e) {
      // Try getting from storage
      const stored = await new Promise(resolve => {
        chrome.storage.local.get(['googleSheetUrl'], (result) => {
          resolve(result.googleSheetUrl);
        });
      });
      googleSheetUrl = stored;
    }
  }

  // Set success message
  const syncNote =
    response.googleSheetsSync?.success === false
      ? `<br><span style="color:#b91c1c">Sheet sync failed: ${response.googleSheetsSync.error}</span>`
      : "<br>All details and URLs saved to your Google Sheet (Master Tracker tab)";

  successMsg.innerHTML = `
    <strong>✅ Automation Complete!</strong><br>
    <strong>${response.scholarshipCount}</strong> scholarships scraped
    ${syncNote}
    <br><br>Next: click <strong>Start Apply Queue</strong> below, then use <strong>Open From List</strong> in the extension.
  `;

  // Set Google Sheet link
  if (googleSheetUrl) {
    sheetLink.value = googleSheetUrl;
  } else {
    sheetLink.value = "Check your Google Sheets account";
  }

  // Show success section
  successDiv.classList.remove("hidden");

  // Start apply queue from Master Tracker (scraped links)
  try {
    await fetch("http://localhost:3847/api/queue/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: "Master Tracker" }),
    });
    $("lastAction").textContent =
      "Scrape saved. Apply queue started — click Open From List, then Fill This Page.";
  } catch {
    $("lastAction").textContent =
      "Scrape saved. Start the app dashboard and click Start Applying.";
  }

  // Setup button handlers
  $("btnCopyLink")?.addEventListener("click", () => {
    navigator.clipboard.writeText(sheetLink.value).then(() => {
      const btn = $("btnCopyLink");
      const oldText = btn.textContent;
      btn.textContent = "✓ Copied!";
      setTimeout(() => {
        btn.textContent = oldText;
      }, 2000);
    });
  });

  $("btnOpenSheet")?.addEventListener("click", () => {
    if (sheetLink.value && sheetLink.value !== "Check your Google Sheets account") {
      chrome.tabs.create({ url: sheetLink.value });
    }
  });

  $("btnNewScrape")?.addEventListener("click", () => {
    // Clear form and restart
    $("boldEmail").value = "";
    $("boldPassword").value = "";
    $("successSection").classList.add("hidden");
    $("workflowProgress").classList.add("hidden");
  });
}

// Listen for workflow progress updates from background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "BOLD_WORKFLOW_PROGRESS") {
    const currentProgressEl = $("currentProgress");
    if (currentProgressEl) {
      // Format progress message with better formatting
      let displayMessage = msg.message;
      
      // Add emoji prefixes for better readability
      if (displayMessage.includes("Navigating")) displayMessage = "🔗 " + displayMessage;
      if (displayMessage.includes("Waiting")) displayMessage = "⏳ " + displayMessage;
      if (displayMessage.includes("Scraping")) displayMessage = "📊 " + displayMessage;
      if (displayMessage.includes("Syncing")) displayMessage = "☁️ " + displayMessage;
      if (displayMessage.includes("Complete")) displayMessage = "✅ " + displayMessage;
      if (displayMessage.includes("Page")) displayMessage = "📄 " + displayMessage;
      if (displayMessage.includes("profile")) displayMessage = "👤 " + displayMessage;
      if (displayMessage.includes("scholarship")) displayMessage = "🎓 " + displayMessage;
      
      currentProgressEl.textContent = displayMessage;
      
      // Log to console for debugging
      console.log("[UI Progress]", displayMessage);
    }

    // Map step messages to step numbers with more precise matching
    const stepMap = {
      "Navigating to Bold.org login": 1,
      "Filling login credentials": 1,
      "Waiting for CAPTCHA": 2,
      "CAPTCHA solved": 2,
      "Navigating to profile page": 3,
      "Scraping profile data": 3,
      "Profile scraped": 3,
      "Navigating to matched scholarships": 4,
      "Scraping scholarships": 5,
      "Scraped page": 5,
      "Total scholarships": 5,
      "Syncing": 6,
      "Complete": 6
    };

    // Find matching step
    for (const [key, stepNum] of Object.entries(stepMap)) {
      if (msg.message.includes(key)) {
        const statusEl = $(`step${stepNum}Status`);
        const stepEl = document.querySelector(`.progress-steps .progress-step:nth-child(${stepNum})`);
        
        if (statusEl && stepEl) {
          // Mark previous steps as done
          for (let i = 1; i < stepNum; i++) {
            const prevStatus = $(`step${i}Status`);
            const prevStep = document.querySelector(`.progress-steps .progress-step:nth-child(${i})`);
            if (prevStatus) prevStatus.textContent = "✓";
            if (prevStep) {
              prevStep.classList.add("done");
              prevStep.classList.remove("active");
            }
          }

          // Mark current step as active
          statusEl.textContent = "⏳";
          stepEl.classList.add("active");
          stepEl.classList.remove("done");
        }
        break;
      }
    }
  }
});

function bind(id, fn) {
  $(id)?.addEventListener("click", () =>
    fn().catch((e) => ($("lastAction").textContent = e.message))
  );
}

document.addEventListener("DOMContentLoaded", () => {
  bind("btnFillAll", fillThisPage);
  bind("btnDone", markDone);
  bind("btnSkip", markSkip);
  bind("btnOpen", openFromList);
  bind("btnOpenUrl", openPastedUrl);
  bind("btnContinue", onContinue);
  bind("btnApply", startBoldAutomation);  // Add Bold.org Apply button
  $("btnReload")?.addEventListener("click", refresh);

  $("urlInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openPastedUrl().catch((err) => ($("lastAction").textContent = err.message));
  });

  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes.pageAnalysis?.newValue) renderGuide(changes.pageAnalysis.newValue);
  });

  refresh();
  setInterval(refresh, 5000);
});
