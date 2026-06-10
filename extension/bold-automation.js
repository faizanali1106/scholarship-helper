/**
 * Bold.org Automation - Chrome Extension Version
 * Handles login, profile scraping, and scholarship URL collection
 * Works within the browser using Content Scripts (no Puppeteer)
 */

window.BoldAutomation = {
  /**
   * Wait for page elements to load with timeout
   * Similar to Puppeteer's waitForFunction
   */
  async waitForPageLoad(checkFunction, timeoutMs = 30000) {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        if (checkFunction()) {
          return true;
        }
      } catch (e) {
        // Continue checking
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }
    
    throw new Error(`Page load timeout after ${timeoutMs}ms`);
  },

  /**
   * Scrape scholarship URLs from Bold.org search/matched results page
   */
  async scrapeScholarshipUrls() {
    const results = [];
    
    try {
      console.log("⏳ Waiting for scholarship cards to load...");
      
      // Wait for scholarship cards to appear
      await this.waitForPageLoad(() => {
        const cards = document.querySelectorAll(
          "[class*='SponsoredScholarship'], [class*='Scholarship-module'], [class*='scholarship-card']"
        );
        return cards.length > 0;
      }, 30000);
      
      console.log("✓ Scholarship cards loaded, scraping...");
      
      // Get all scholarship cards
      const scholarshipCards = document.querySelectorAll(
        "[class*='SponsoredScholarship'], [class*='Scholarship-module'], [class*='scholarship-card']"
      );
      
      console.log(`Found ${scholarshipCards.length} scholarship cards on page`);
      
      scholarshipCards.forEach((card, idx) => {
        try {
          const scholarship = {};
          
          // Extract name and URL from link
          const nameLink = card.querySelector("a[href*='scholarship']");
          if (nameLink) {
            scholarship.name = nameLink.textContent.trim();
            scholarship.url = nameLink.href;
          }
          
          // Extract type (Sponsored badge)
          const badge = card.querySelector("[class*='badge']");
          if (badge) {
            scholarship.type = badge.textContent.trim();
          } else {
            scholarship.type = "Regular";
          }
          
          // Extract organization/funder
          const donorName = card.querySelector("[class*='Donor']");
          if (donorName) {
            const nameEl = donorName.querySelector("div[class*='name']");
            if (nameEl) {
              scholarship.organization = nameEl.textContent.trim();
            }
          }
          
          // Extract amount
          const amountElements = Array.from(card.querySelectorAll("div, span")).filter(el =>
            /^\$[\d,]+/.test(el.textContent.trim())
          );
          if (amountElements.length > 0) {
            scholarship.amount = amountElements[0].textContent.trim();
          }
          
          // Extract deadline
          const deadlineText = Array.from(card.querySelectorAll("div")).find(el =>
            el.textContent.includes("Deadline")
          );
          if (deadlineText) {
            scholarship.deadline = deadlineText.textContent.replace("Deadline", "").trim();
          }
          
          // Extract description
          const description = card.querySelector("[class*='description']");
          if (description) {
            scholarship.description = description.textContent.trim();
          }
          
          // Only add if we got at least the name and URL
          if (scholarship.name && scholarship.url) {
            scholarship.scrapedAt = new Date().toISOString();
            results.push(scholarship);
            console.log(`  [${idx + 1}] ✓ ${scholarship.name} - ${scholarship.url}`);
          }
        } catch (e) {
          console.log(`Error processing scholarship card ${idx}:`, e.message);
        }
      });
      
      console.log(`✅ Scraped ${results.length} scholarship URLs from page`);
      return results;
    } catch (e) {
      console.error("❌ Error scraping scholarships:", e.message);
      return results;
    }
  },

  /**
   * Check if we're on a Bold.org login page
   */
  isLoginPage() {
    const url = window.location.href;
    const body = document.body.innerText.toLowerCase();
    
    return (
      url.includes("bold.org/login") ||
      (url.includes("bold.org") && body.includes("sign in"))
    );
  },

  /**
   * Check if we're on Bold.org matched scholarships page
   */
  isScholarshipsPage() {
    return window.location.href.includes("bold.org/app/matched/scholarships");
  },

  /**
   * Check if we're on Bold.org profile page
   */
  isProfilePage() {
    return window.location.href.includes("bold.org/profile");
  },

  /**
   * Scrape profile data from Bold.org
   */
  async scrapeProfileData() {
    const data = {};

    try {
      console.log("⏳ Waiting for profile page to fully load...");
      
      // Wait for key profile elements to load
      await this.waitForPageLoad(() => {
        const profileImg = document.querySelector('img[alt="user profile avatar"]');
        const nameH2 = document.querySelector("h2");
        const demographics = document.querySelectorAll("span.text-base.font-medium");
        
        // Check if we have the essential profile elements
        return profileImg && nameH2 && demographics.length > 0;
      }, 30000);
      
      console.log("✓ Profile page loaded, extracting data...");

      // Extract profile image URL
      const profileImg = document.querySelector('img[alt="user profile avatar"]');
      if (profileImg && profileImg.src) {
        data.profileImageUrl = profileImg.src;
        console.log(`  📸 Profile Image: ${profileImg.src}`);
      }

      // Extract full name
      const nameH2 = document.querySelector("h2");
      if (nameH2) {
        const fullText = nameH2.textContent.trim();
        data.fullName = fullText;
        console.log(`  👤 Full Name: ${fullText}`);
        
        const nameParts = fullText.split(" ").filter(p => p.length > 0);
        if (nameParts.length > 0) data.firstName = nameParts[0];
        if (nameParts.length > 1) data.preferredName = nameParts[nameParts.length - 1];
        if (nameParts.length > 2) data.lastName = nameParts.slice(1, -1).join(" ");
        else if (nameParts.length === 2) data.lastName = nameParts[1];
      }

      // Extract location
      const locationItems = document.querySelectorAll("span.text-base.font-medium");
      if (locationItems.length > 0) {
        const locText = locationItems[0].textContent.trim();
        if (locText.includes(",")) {
          const [city, state] = locText.split(", ");
          data.city = city.trim();
          data.state = state.trim();
          console.log(`  📍 Location: ${city}, ${state}`);
        }
      }

      // Extract demographics
      const demoSpans = Array.from(document.querySelectorAll("span.text-base.font-medium"));
      if (demoSpans.length >= 2) {
        const ageValue = demoSpans[1].textContent.trim();
        const genderValue = demoSpans[2]?.textContent.trim();
        
        if (/^\d+$/.test(ageValue)) {
          data.age = parseInt(ageValue);
          console.log(`  🎂 Age: ${ageValue}`);
        }
        if (genderValue) {
          data.gender = genderValue;
          console.log(`  👥 Gender: ${genderValue}`);
        }
      }

      // Extract GPA
      const gpaH6 = document.querySelector("h6[class*='text-[22px]'], h6.text-2xl");
      if (gpaH6) {
        const gpaText = gpaH6.textContent.trim();
        if (/^\d+\.\d+$/.test(gpaText)) {
          data.gpa = gpaText;
          console.log(`  📊 GPA: ${gpaText}`);
        }
      }

      // Extract education and school
      const schoolH4 = document.querySelector("h4.text-base.font-semibold");
      if (schoolH4) {
        data.highSchool = schoolH4.textContent.trim();
        console.log(`  🏫 High School: ${schoolH4.textContent.trim()}`);
        
        const eduLevel = schoolH4.nextElementSibling;
        if (eduLevel && eduLevel.tagName === "SPAN") {
          data.educationLevel = eduLevel.textContent.trim();
          console.log(`  📚 Education Level: ${eduLevel.textContent.trim()}`);
        }
      }

      // Extract bio/career goals
      const bioDiv = document.querySelector("div.whitespace-pre-line");
      if (bioDiv) {
        const bioText = bioDiv.textContent.trim();
        const lines = bioText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
          data.careerGoals = lines[0];
          console.log(`  🎯 Career Goals: ${lines[0]}`);
        }
        if (lines.length > 1) {
          data.personalStory = lines.slice(1).join("\n");
          console.log(`  📖 Personal Story: ${lines.slice(1).join(" ")}`);
        }
      }

      data.scrapedAt = new Date().toISOString();
      console.log(`✅ Profile data scraped - ${Object.keys(data).length} fields extracted`);
      return data;
    } catch (e) {
      console.error("❌ Error scraping profile:", e.message);
      return data;
    }
  },

  /**
   * Navigate to Bold.org login
   */
  navigateToLogin() {
    window.location.href = "https://app.bold.org/login/";
  },

  /**
   * Navigate to Bold.org profile
   */
  navigateToProfile() {
    window.location.href = "https://app.bold.org/profile/";
  },

  /**
   * Navigate to Bold.org matched scholarships
   */
  navigateToScholarships() {
    window.location.href = "https://app.bold.org/app/matched/scholarships/";
  },

  /**
   * Fill login form (email and password)
   * Called after user navigates to login page
   */
  async fillLoginForm(email, password) {
    try {
      const emailInput = document.querySelector('input[type="email"][placeholder="Email"]');
      const passwordInput = document.querySelector('input[type="password"][placeholder="Password"]');
      
      if (!emailInput || !passwordInput) {
        throw new Error("Login form not found");
      }

      // Fill email
      emailInput.focus();
      emailInput.value = email;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Small delay
      await new Promise(r => setTimeout(r, 500));

      // Fill password
      passwordInput.focus();
      passwordInput.value = password;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Small delay
      await new Promise(r => setTimeout(r, 500));

      // Find and click Sign In button
      const signInBtn = Array.from(document.querySelectorAll("button")).find(b =>
        b.textContent.includes("Sign In")
      );
      
      if (!signInBtn) {
        throw new Error("Sign In button not found");
      }

      signInBtn.click();
      console.log("✓ Login form filled and submitted");
      return { success: true };
    } catch (e) {
      console.error("Error filling login form:", e);
      return { success: false, error: e.message };
    }
  }
};

console.log("✓ Bold.org Automation module loaded");
