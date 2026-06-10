/**
 * Fastweb Scholarship Scraper (JavaScript)
 * Converted from Python - Scrapes scholarship data from Fastweb using Playwright
 * Saves to CSV file
 * 
 * Uses cheerio for HTML parsing (like BeautifulSoup)
 */

const { chromium } = require('playwright');
const { stringify } = require('csv-stringify');
const { load } = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class FastwebScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Safely extract text from an element
   */
  safeGetText(element) {
    if (!element || element.length === 0) return 'N/A';
    const text = element.text ? element.text() : element.toString();
    return text.trim() || 'N/A';
  }

  /**
   * Extract GPA value from text
   */
  extractGPA(text) {
    if (!text) return null;

    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      // Remove punctuation and convert to lowercase
      const word = words[i].toLowerCase().replace(/[^\w]/g, '');
      
      if (word === 'gpa') {
        // Try nearby words: -1, -2, 1, 2
        for (const offset of [-1, -2, 1, 2]) {
          const index = i + offset;
          if (index >= 0 && index < words.length) {
            try {
              const value = parseFloat(words[index].replace(/[^\d.]/g, ''));
              if (!isNaN(value)) return value;
            } catch (e) {
              continue;
            }
          }
        }
        return null;
      }
    }
    return null;
  }

  /**
   * Collapse whitespace and trim text fields
   */
  cleanText(text) {
    if (!text || text === 'N/A') return 'N/A';
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || 'N/A';
  }

  /**
   * Normalize deadline text (remove calendar UI noise)
   */
  cleanDeadline(deadline) {
    if (!deadline || deadline === 'N/A') return 'N/A';
    return this.cleanText(
      deadline.replace(/add to calendar/gi, '').replace(/\u00a0/g, ' ')
    );
  }

  /**
   * Normalize state label for consistent sorting
   */
  normalizeState(stateName) {
    return this.cleanText(stateName.replace(/\s*scholarships$/i, ''));
  }

  /**
   * Resolve a usable apply link
   */
  resolveApplyLink(directLink, scholarshipUrl) {
    if (!directLink || directLink === 'N/A' || directLink === '#login_widget') {
      return scholarshipUrl;
    }
    if (directLink.startsWith('http')) return directLink;
    return new URL(directLink, scholarshipUrl).href;
  }

  /**
   * Build a cleaned CSV row from scraped fields
   */
  buildRow(fields) {
    return [
      this.cleanText(fields.title),
      this.cleanText(fields.provider),
      this.normalizeState(fields.stateName),
      this.cleanText(fields.amount),
      this.cleanText(fields.awards),
      this.cleanDeadline(fields.deadline),
      this.cleanText(fields.description),
      fields.gpa || '--',
      fields.applyLink,
    ];
  }

  /**
   * Remove duplicates and sort by state, then title
   */
  organizeRows(rows) {
    const seen = new Set();
    const unique = [];

    for (const row of rows) {
      const key = `${row[0]}|${row[2]}|${row[1]}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    return unique.sort((a, b) => {
      const byState = a[2].localeCompare(b[2], undefined, { sensitivity: 'base' });
      if (byState !== 0) return byState;
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    });
  }

  /**
   * Write the full organized CSV file (sorted, deduplicated, one row per line)
   */
  async writeOrganizedCSV(filepath, rows) {
    const headers = [
      'Title', 'Provider', 'State', 'Amount', 'Awards',
      'Deadline', 'Description', 'Min GPA', 'Apply Link',
    ];
    const organized = this.organizeRows(rows);

    return new Promise((resolve, reject) => {
      stringify([headers, ...organized], { quoted: true }, (err, output) => {
        if (err) return reject(err);

        fs.writeFile(filepath, output, 'utf8', (writeErr) => {
          if (writeErr) return reject(writeErr);
          resolve(organized.length);
        });
      });
    });
  }

  /**
   * Main scraping function
   */
  async scrapeFastweb(csvFilename = 'fastweb_scholarships.csv', headless = false, options = {}) {
    const maxStates = options.maxStates ?? null;
    const results = {
      total_scraped: 0,
      errors: [],
      states_processed: 0,
      csv_file: csvFilename
    };

    const scrapedRows = [];

    try {
      console.log(`📄 Scholarships will be saved to an organized CSV: ${csvFilename}`);

      // Launch browser
      this.browser = await chromium.launch({ headless });

      // Check for saved auth state
      let storageState = null;
      if (fs.existsSync('state.json')) {
        storageState = 'state.json';
        console.log('ℹ️  Using existing authentication state');
      }

      // Create context and page
      const contextOptions = storageState ? { storageState } : {};
      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();

      const baseUrl = 'https://www.fastweb.com/directory/scholarships-by-state';
      console.log(`🌐 Navigating to ${baseUrl}`);
      
      await this.page.goto(baseUrl, { waitUntil: 'networkidle' });

      // Get page content and parse with cheerio
      const pageContent = await this.page.content();
      const $ = load(pageContent);

      // Find state divs
      const stateDivs = $('div.grid-x.grid-margin-x.us-states');

      if (stateDivs.length === 0) {
        console.warn('⚠️  No state divs found. The page structure may have changed.');
        results.errors.push('No state divs found on page');
        await this.page.close();
        await this.browser.close();
        return results;
      }

      let scholarshipCount = 1;
      let statesSeen = 0;

      // Iterate through states
      for (const stateDiv of stateDivs) {
        const stateLinks = $(stateDiv).find('li');
        console.log(`📍 Found ${stateLinks.length} states to process`);

        for (const stateItem of stateLinks) {
          if (maxStates != null && statesSeen >= maxStates) {
            console.log(`⏹️  Reached maxStates limit (${maxStates})`);
            break;
          }
          try {
            const $stateItem = $(stateItem);
            const stateHref = $stateItem.find('a').attr('href');
            const stateName = $stateItem.find('a').text().trim();
            
            if (!stateHref) continue;

            const stateFilter = options.stateNames;
            if (stateFilter?.length && !stateFilter.some((s) => stateName.toLowerCase().includes(s.toLowerCase()))) {
              continue;
            }

            const fullStateUrl = new URL(stateHref, baseUrl).href;

            console.log(`🗺️  Processing state: ${stateName}`);

            // Navigate to state page
            const page2 = await this.context.newPage();
            await page2.goto(fullStateUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page2.waitForTimeout(1500);

            const statePageContent = await page2.content();
            const $2 = load(statePageContent);

            // Find scholarship rows
            const scholarshipRows = $2('tbody.scholarship_wrap');
            console.log(`📚 Found ${scholarshipRows.length} scholarships in ${stateName}`);

            for (const row of scholarshipRows) {
              try {
                const $row = $(row);
                const scholarshipLink = $row.find('a').first();
                
                if (scholarshipLink.length === 0) continue;

                const scholarshipHref = scholarshipLink.attr('href');
                if (!scholarshipHref) continue;

                const fullScholarshipUrl = new URL(scholarshipHref, fullStateUrl).href;

                // Navigate to scholarship page
                const page3 = await this.context.newPage();
                await page3.goto(fullScholarshipUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page3.waitForTimeout(1000);

                const scholarshipContent = await page3.content();
                const $3 = load(scholarshipContent);

                // Extract scholarship details
                const stateItem3 = $3('div.cell.large-8');

                if (stateItem3.length > 0) {
                  const title = this.safeGetText(stateItem3.find('h1.award-name').first());
                  
                  let provider = this.safeGetText(stateItem3.find('p.award-provider').first());
                  if (provider === 'N/A') {
                    provider = this.safeGetText(stateItem3.find('a.award-provider').first());
                  }

                  const amountWrapper = stateItem3.find('div.award-amount-wrapper');
                  const amount = this.safeGetText(amountWrapper.find('p.award-info').first());

                  const countWrapper = stateItem3.find('div.awards-count-wrapper');
                  const awards = this.safeGetText(countWrapper.find('p.award-info').first());

                  const deadlineWrapper = stateItem3.find('div.award-deadline-wrapper');
                  const rawDeadline = deadlineWrapper.length > 0 
                    ? this.safeGetText(deadlineWrapper.find('p.award-info').first())
                    : 'N/A';

                  const applyWrapper = stateItem3.find('div.apply-now-button-wrapper');
                  const directLink = applyWrapper.find('a').length > 0 
                    ? applyWrapper.find('a').attr('href') 
                    : 'N/A';

                  // Get description
                  const descriptionSection = $3('div.award-description-section');
                  const description = this.safeGetText(descriptionSection.find('p.award-description').first());

                  // Extract GPA
                  const gpa = this.extractGPA(description) || '--';
                  const applyLink = this.resolveApplyLink(directLink, fullScholarshipUrl);
                  const deadline = this.cleanDeadline(rawDeadline);
                  const cleanState = this.normalizeState(stateName);

                  // Log scholarship
                  console.log(`${scholarshipCount}) ${this.cleanText(title)}`);
                  console.log(`   📎 Link: ${fullScholarshipUrl}`);
                  console.log(`   Provider: ${provider} | State: ${cleanState} | Amount: ${amount}`);
                  console.log(`   GPA: ${gpa} | Deadline: ${deadline}\n`);

                  scrapedRows.push(this.buildRow({
                    title,
                    provider,
                    stateName,
                    amount,
                    awards,
                    deadline: rawDeadline,
                    description,
                    gpa,
                    applyLink,
                  }));

                  scholarshipCount++;
                } else {
                  console.warn(`⚠️  Could not find state_item3 div in ${fullScholarshipUrl}`);
                }

                await page3.close();

              } catch (error) {
                console.error(`❌ Error processing scholarship: ${error.message}`);
                results.errors.push(`Scholarship processing error: ${error.message}`);
                try {
                  await page3.close();
                } catch (ignore) {}
              }
            }

            await page2.close();
            results.states_processed++;
            statesSeen++;

          } catch (error) {
            console.error(`❌ Error processing state: ${error.message}`);
            results.errors.push(`State processing error: ${error.message}`);
            try {
              await page2.close();
            } catch (ignore) {}
          }
        }
        if (maxStates != null && statesSeen >= maxStates) break;
      }

      await this.page.close();
      await this.browser.close();

      results.total_scraped = scholarshipCount - 1;

    } catch (error) {
      console.error(`❌ Fatal error in scraper: ${error.message}`);
      results.errors.push(`Fatal scraper error: ${error.message}`);
      if (this.browser) {
        await this.browser.close();
      }
    } finally {
      if (scrapedRows.length > 0) {
        try {
          const savedCount = await this.writeOrganizedCSV(csvFilename, scrapedRows);
          console.log(`\n✅ Saved ${savedCount} organized scholarships to ${csvFilename}`);
          console.log('   • Sorted by state → title');
          console.log('   • Duplicates removed');
          console.log('   • Clean single-line rows\n');
          results.total_saved = savedCount;
        } catch (e) {
          console.error(`❌ Error writing organized CSV: ${e.message}`);
          results.errors.push(`CSV write error: ${e.message}`);
        }
      }
    }

    return results;
  }

  /**
   * Print results summary
   */
  printResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Scholarships Scraped: ${results.total_scraped}`);
    console.log(`Total Saved (organized): ${results.total_saved ?? results.total_scraped}`);
    console.log(`States Processed: ${results.states_processed}`);
    console.log(`Saved to: ${results.csv_file}`);
    
    if (results.errors.length > 0) {
      console.log(`\nErrors Encountered: ${results.errors.length}`);
      results.errors.forEach(err => {
        console.error(`  - ${err}`);
      });
    }
    console.log('='.repeat(60) + '\n');
  }
}

/**
 * Main execution
 */
async function main() {
  const scraper = new FastwebScraper();
  const csvFilename = 'fastweb_scholarships.csv';

  console.log('🚀 Starting Fastweb scholarship scraper...\n');
  const results = await scraper.scrapeFastweb(csvFilename, false);
  
  scraper.printResults(results);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = FastwebScraper;
