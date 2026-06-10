let job = {
  running: false,
  site: null,
  message: "Idle",
  error: null,
  result: null,
  startedAt: null,
  finishedAt: null,
};

export function getScrapeJob() {
  return { ...job };
}

export function startScrapeJob(site) {
  if (job.running) {
    throw new Error(`Scrape already running for ${job.site}`);
  }
  job = {
    running: true,
    site,
    message: `Starting ${site} scrape...`,
    error: null,
    result: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

export function updateScrapeJob(partial) {
  job = { ...job, ...partial };
}

export function finishScrapeJob(result) {
  job = {
    ...job,
    running: false,
    message: result?.message || "Complete",
    result,
    finishedAt: new Date().toISOString(),
  };
}

export function failScrapeJob(error) {
  job = {
    ...job,
    running: false,
    error: error.message || String(error),
    message: `Failed: ${error.message || error}`,
    finishedAt: new Date().toISOString(),
  };
}
