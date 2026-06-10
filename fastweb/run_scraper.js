/**
 * Fastweb Scraper Launcher (JavaScript)
 * Calls the scraper directly without spawning Python
 */

const FastwebScraper = require('./scraper_fastweb');

async function runScraper() {
  const scraper = new FastwebScraper();
  const csvFilename = 'fastweb_scholarships.csv';

  try {
    console.log('🚀 Starting Fastweb scholarship scraper...\n');
    const results = await scraper.scrapeFastweb(csvFilename, false);
    
    scraper.printResults(results);
    
    if (results.errors.length === 0) {
      console.log('✅ Scraper completed successfully');
      process.exit(0);
    } else {
      console.log(`⚠️  Scraper completed with ${results.errors.length} error(s)`);
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runScraper();
}

module.exports = { runScraper };
