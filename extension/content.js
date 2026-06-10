chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ANALYZE_PAGE") {
        sendResponse({
          ok: true,
          analysis: window.ScholarshipPageAnalyzer?.analyzePage?.() || {
            state: "manual",
            title: "Navigate to the form",
            message: "Open the application form, then click Fill This Page.",
            isLoginPage: false,
          },
          url: location.href,
        });
      } else if (msg.type === "FILL_ALL") {
        const analysis = window.ScholarshipPageAnalyzer?.analyzePage?.() || {};
        if (analysis.isLoginPage) {
          sendResponse({
            ok: false,
            error: "You are still on a login page. Open the application form first.",
            analysis,
          });
          return;
        }
        const result = window.ScholarshipAutofill.autofillProfile(msg.entries);
        let essayInserted = false;
        if (msg.essay) {
          essayInserted = window.ScholarshipAutofill.insertEssay(msg.essay);
        }
        window.ScholarshipAutofill.showToast(
          `Filled ${result.filled} fields${essayInserted ? " + essay" : ""}`,
          result.filled || essayInserted ? "success" : "warn"
        );
        sendResponse({ ok: true, filled: result.filled, essayInserted, analysis });
      } else if (msg.type === "PAGE_TEXT") {
        sendResponse({
          text: window.ScholarshipAutofill.getPageText(),
          url: location.href,
        });
      } else if (msg.type === "BOLD_GET_PAGE_STATUS") {
        // Get current Bold.org page status
        sendResponse({
          ok: true,
          isLoginPage: window.BoldAutomation?.isLoginPage?.(),
          isProfilePage: window.BoldAutomation?.isProfilePage?.(),
          isScholarshipsPage: window.BoldAutomation?.isScholarshipsPage?.(),
          url: location.href
        });
      } else if (msg.type === "BOLD_FILL_LOGIN") {
        // Fill Bold.org login form
        const result = await window.BoldAutomation?.fillLoginForm?.(msg.email, msg.password);
        sendResponse(result);
      } else if (msg.type === "BOLD_SCRAPE_PROFILE") {
        // Scrape profile data
        const data = await window.BoldAutomation?.scrapeProfileData?.();
        sendResponse({ ok: true, profile: data });
      } else if (msg.type === "BOLD_SCRAPE_SCHOLARSHIPS") {
        // Scrape scholarship URLs from page
        const scholarships = await window.BoldAutomation?.scrapeScholarshipUrls?.();
        sendResponse({ ok: true, scholarships });
      } else if (msg.type === "BOLD_NAVIGATE_LOGIN") {
        window.BoldAutomation?.navigateToLogin?.();
        sendResponse({ ok: true, message: "Navigating to login..." });
      } else if (msg.type === "BOLD_NAVIGATE_PROFILE") {
        window.BoldAutomation?.navigateToProfile?.();
        sendResponse({ ok: true, message: "Navigating to profile..." });
      } else if (msg.type === "BOLD_NAVIGATE_SCHOLARSHIPS") {
        window.BoldAutomation?.navigateToScholarships?.();
        sendResponse({ ok: true, message: "Navigating to scholarships..." });
      } else if (msg.type === "BOLD_CHECK_NEXT_PAGE") {
        // Check if next page button exists and is enabled
        const nextButton = Array.from(document.querySelectorAll("button")).find(btn =>
          btn.textContent.includes("Next Page") && !btn.disabled
        );
        sendResponse({ ok: true, hasNextPage: !!nextButton });
      } else if (msg.type === "BOLD_CLICK_NEXT_PAGE") {
        // Click the next page button
        const nextButton = Array.from(document.querySelectorAll("button")).find(btn =>
          btn.textContent.includes("Next Page") && !btn.disabled
        );
        if (nextButton) {
          nextButton.click();
          sendResponse({ ok: true, message: "Next page clicked" });
        } else {
          sendResponse({ ok: false, error: "Next page button not found" });
        }
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
});

function getAnalysis() {
  return (
    window.ScholarshipPageAnalyzer?.analyzePage?.() || {
      state: "manual",
      title: "Navigate to the form",
      message: "Open the application form, then click Fill This Page.",
      isLoginPage: false,
    }
  );
}

function reportStateChange() {
  const analysis = getAnalysis();
  chrome.runtime
    .sendMessage({ type: "PAGE_STATE", analysis, url: location.href })
    .catch(() => {});
}

let lastStateKey = "";

function maybeReport() {
  const a = getAnalysis();
  const key = `${a.state}:${location.href}`;
  if (key !== lastStateKey) {
    lastStateKey = key;
    reportStateChange();
  }
}

window.addEventListener("load", () => setTimeout(maybeReport, 800));
setInterval(maybeReport, 3000);
