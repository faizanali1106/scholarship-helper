/** True when running on Vercel (serverless). Scraping & file writes are disabled. */
export function isVercel() {
  return Boolean(process.env.VERCEL);
}

export function scrapeUnavailableMessage() {
  return "Scholarship import runs on your computer only (npm start). On Vercel, use the pre-loaded list or Restore backup.";
}
