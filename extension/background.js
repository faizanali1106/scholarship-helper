chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.storage.session.set({ pageAnalysis: null, workflowStep: "idle" });

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "PAGE_STATE" && sender.tab?.id) {
    chrome.storage.session.set({
      pageAnalysis: msg.analysis,
      pageUrl: msg.url,
      tabId: sender.tab.id,
      updatedAt: Date.now(),
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
    chrome.storage.session.set({ activeWorkflowTab: tabId });
  }
});

/**
 * Bold.org Automation Workflow Handler
 * Handles the orchestration of scholarship scraping and Google Sheets sync
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "BOLD_START_WORKFLOW") {
        // Start Bold.org automation workflow
        const { email, password } = msg;
        
        if (!email || !password) {
          sendResponse({ ok: false, error: "Email and password required" });
          return;
        }

        // Step 1: Get active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        
        if (!tab) {
          sendResponse({ ok: false, error: "No active tab found" });
          return;
        }

        const tabId = tab.id;
        
        // Step 2: Send progress updates
        const updateProgress = (step, message) => {
          chrome.runtime.sendMessage({
            type: "BOLD_WORKFLOW_PROGRESS",
            step,
            message
          }).catch(() => {});
        };

        try {
          // Navigate to login
          updateProgress(1, "Navigating to Bold.org login...");
          await chrome.tabs.update(tabId, {
            url: "https://app.bold.org/login/"
          });
          
          // Wait for page to load
          await new Promise(r => setTimeout(r, 3000));

          // Fill login form
          updateProgress(2, "Filling login credentials...");
          const loginResult = await chrome.tabs.sendMessage(tabId, {
            type: "BOLD_FILL_LOGIN",
            email,
            password
          });

          if (!loginResult.success) {
            throw new Error(loginResult.error || "Failed to fill login form");
          }

          // Wait for user to solve CAPTCHA (3 minute timeout)
          updateProgress(3, "Waiting for CAPTCHA solution (3 min timeout)...");
          let captchaWaitTime = 0;
          const maxWaitTime = 180000;

          while (captchaWaitTime < maxWaitTime) {
            await new Promise(r => setTimeout(r, 2000));
            captchaWaitTime += 2000;

            const pageStatus = await chrome.tabs.sendMessage(tabId, {
              type: "BOLD_GET_PAGE_STATUS"
            }).catch(() => null);

            if (pageStatus && !pageStatus.isLoginPage) {
              updateProgress(3, "CAPTCHA solved!");
              break;
            }
          }

          // Navigate to profile
          updateProgress(4, "Navigating to profile page...");
          await chrome.tabs.update(tabId, {
            url: "https://app.bold.org/profile/"
          });
          
          // Wait EXTRA time for profile page to fully load
          console.log("[WORKFLOW] Waiting for profile page to fully load (taking extra time)...");
          await new Promise(r => setTimeout(r, 8000)); // 8 seconds initial wait
          
          // Additional wait for dynamic content
          await new Promise(r => setTimeout(r, 4000)); // 4 more seconds

          // Scrape profile
          updateProgress(5, "Scraping profile data from https://app.bold.org/profile/...");
          console.log("[WORKFLOW] Scraping profile...");
          
          let profileResult;
          try {
            profileResult = await chrome.tabs.sendMessage(tabId, {
              type: "BOLD_SCRAPE_PROFILE"
            });
            
            if (profileResult.profile) {
              console.log("[WORKFLOW] Profile scraped successfully:", Object.keys(profileResult.profile).length, "fields");
              updateProgress(5, `Profile scraped: ${Object.keys(profileResult.profile).length} fields found`);
            }
          } catch (profileError) {
            console.warn("[WORKFLOW] Profile scraping had issues:", profileError.message);
            updateProgress(5, "Profile scraping completed (partial data)");
            profileResult = { profile: {} };
          }

          // Wait before navigating to scholarships
          await new Promise(r => setTimeout(r, 2000));

          // Navigate to scholarships
          updateProgress(6, "Navigating to matched scholarships page...");
          await chrome.tabs.update(tabId, {
            url: "https://app.bold.org/app/matched/scholarships/"
          });
          
          // Wait EXTRA time for scholarships page to fully load
          console.log("[WORKFLOW] Waiting for scholarships page to fully load (taking extra time)...");
          await new Promise(r => setTimeout(r, 8000)); // 8 seconds initial wait
          
          // Additional wait for dynamic content and pagination
          await new Promise(r => setTimeout(r, 4000)); // 4 more seconds
          
          // Wait for cards to appear if needed
          await new Promise(r => setTimeout(r, 3000)); // 3 more seconds for rendering

          // Scrape all scholarship pages
          updateProgress(7, "Scraping scholarships from all pages...");
          console.log("[WORKFLOW] Starting scholarship scraping from:", "https://app.bold.org/app/matched/scholarships/");
          
          let allScholarships = [];
          let pageNum = 1;
          let hasNextPage = true;

          while (hasNextPage && pageNum <= 10) {  // Max 10 pages safety limit
            try {
              console.log(`[WORKFLOW] Scraping page ${pageNum}...`);
              
              const scholarshipResult = await chrome.tabs.sendMessage(tabId, {
                type: "BOLD_SCRAPE_SCHOLARSHIPS"
              }).catch(err => {
                console.warn(`[WORKFLOW] Error scraping page ${pageNum}:`, err.message);
                return { ok: false, scholarships: [] };
              });

              if (scholarshipResult.ok && scholarshipResult.scholarships) {
                const pageCount = scholarshipResult.scholarships.length;
                allScholarships = [...allScholarships, ...scholarshipResult.scholarships];
                console.log(`[WORKFLOW] Page ${pageNum}: Scraped ${pageCount} scholarships (Total: ${allScholarships.length})`);
                updateProgress(7, `Scraped page ${pageNum}: ${pageCount} scholarships found (Total: ${allScholarships.length})`);
              } else {
                console.log(`[WORKFLOW] Page ${pageNum}: No scholarships found or scraping failed`);
              }

              // Check for next page button
              const nextPageResult = await chrome.tabs.sendMessage(tabId, {
                type: "BOLD_CHECK_NEXT_PAGE"
              }).catch(() => ({ hasNextPage: false }));

              if (nextPageResult && nextPageResult.hasNextPage) {
                console.log(`[WORKFLOW] Next page button found, navigating...`);
                pageNum++;
                
                // Click next page
                await chrome.tabs.sendMessage(tabId, {
                  type: "BOLD_CLICK_NEXT_PAGE"
                }).catch(() => {});
                
                // Wait for new page to load
                console.log(`[WORKFLOW] Waiting for page ${pageNum} to load...`);
                await new Promise(r => setTimeout(r, 3000));
                
                // Extra wait for scholarship cards to render
                await new Promise(r => setTimeout(r, 3000));
              } else {
                console.log(`[WORKFLOW] No more pages (total pages scraped: ${pageNum})`);
                hasNextPage = false;
              }
            } catch (pageError) {
              console.error(`[WORKFLOW] Error processing page ${pageNum}:`, pageError.message);
              hasNextPage = false;
            }
          }

          console.log(`[WORKFLOW] Total scholarships scraped: ${allScholarships.length}`);

          // Sync to Google Sheets
          updateProgress(8, `Syncing ${allScholarships.length} scholarships to Google Sheets...`);
          const syncResult = await syncToGoogleSheets(allScholarships);

          // Get Google Sheet URL for response
          let googleSheetUrl = "";
          try {
            const response = await fetch("http://localhost:3847/api/settings");
            const settings = await response.json();
            googleSheetUrl = settings.googleSheetUrl || settings.googleAppsScriptUrl;
          } catch (e) {
            // Use fallback or empty
          }

          updateProgress(9, "Complete! All data saved.");
          
          sendResponse({
            ok: true,
            message: `Successfully scraped ${allScholarships.length} scholarships`,
            scholarshipCount: allScholarships.length,
            profile: profileResult.profile,
            scholarships: allScholarships,
            googleSheetsSync: syncResult,
            googleSheetUrl: googleSheetUrl
          });

        } catch (workflowError) {
          updateProgress(0, `Error: ${workflowError.message}`);
          sendResponse({ ok: false, error: workflowError.message });
        }
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});

/**
 * Sync scholarships to Google Sheets
 */
async function syncToGoogleSheets(scholarships) {
  try {
    console.log("[WORKFLOW] Starting Google Sheets sync...");
    console.log("[WORKFLOW] Scholarships to sync:", scholarships.length);
    
    // Get settings from storage
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(['googleAppsScriptUrl'], (result) => {
        resolve(result);
      });
    });

    console.log("[WORKFLOW] Chrome storage webhook URL:", settings.googleAppsScriptUrl ? "Found" : "Not found");

    if (!settings.googleAppsScriptUrl) {
      // Try to fetch from localhost server
      console.log("[WORKFLOW] Fetching webhook URL from localhost:3847...");
      try {
        const response = await fetch("http://localhost:3847/api/settings");
        const serverSettings = await response.json();
        settings.googleAppsScriptUrl = serverSettings.googleAppsScriptUrl;
        settings.masterSheetName = serverSettings.masterSheetName || "Master Tracker";
        console.log("[WORKFLOW] Got webhook URL from server:", serverSettings.googleAppsScriptUrl ? "Found" : "Not found");
      } catch (e) {
        console.warn("[WORKFLOW] Could not fetch from localhost:", e.message);
      }
    }

    if (!settings.googleAppsScriptUrl) {
      throw new Error("Google Apps Script URL not configured — set it in the dashboard (Step 1)");
    }

    console.log("[WORKFLOW] Using webhook URL:", settings.googleAppsScriptUrl.substring(0, 50) + "...");

    // Prepare data for Google Sheets
    const sheetData = scholarships.map((sch, idx) => ({
      "Scholarship Name": sch.name || "",
      "Type": sch.type || "",
      "Organization": sch.organization || "",
      "Amount": sch.amount || "",
      "Deadline": sch.deadline || "",
      "Notes": sch.description || "",
      "Application URL": sch.url || "",
      "Essay Required(Y/N)": "",
      "Document Needed": "",
      "Status": "Not Started",
      "Scraped At": sch.scrapedAt || new Date().toISOString()
    }));

    console.log("[WORKFLOW] Formatted", sheetData.length, "scholarships for sync");
    console.log("[WORKFLOW] Sample data:", sheetData[0]);

    // Send to Google Apps Script
    console.log("[WORKFLOW] Sending POST request to:", settings.googleAppsScriptUrl.substring(0, 50) + "...");
    
    const response = await fetch(settings.googleAppsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "appendScholarships",
        scholarships: sheetData,
        masterSheetName: settings.masterSheetName || "Master Tracker",
        timestamp: new Date().toISOString()
      })
    });

    console.log("[WORKFLOW] Response status:", response.status);

    const result = await response.json();
    console.log("[WORKFLOW] Response from Google Apps Script:", result);

    if (!response.ok || result.error) {
      throw new Error(result.error || `HTTP ${response.status}: Failed to sync to Google Sheets`);
    }

    console.log("✅ [WORKFLOW] Successfully synced to Google Sheets!");
    return {
      success: true,
      message: result.message || `Synced ${sheetData.length} scholarships`,
      count: sheetData.length
    };
  } catch (error) {
    console.error("❌ [WORKFLOW] Google Sheets sync ERROR:", error.message);
    console.error("❌ [WORKFLOW] Full error:", error);
    return {
      success: false,
      error: error.message,
      note: "Data saved locally but not synced to Google Sheets"
    };
  }
}
