let job = {
  running: false,
  mode: null,
  message: "Idle",
  error: null,
  total: 0,
  done: 0,
  filled: 0,
  submitted: 0,
  failed: 0,
  results: [],
  startedAt: null,
  finishedAt: null,
};

export function getApplyJob() {
  return { ...job, results: job.results.slice(-50) };
}

export function startApplyJob(mode, total) {
  job = {
    running: true,
    mode,
    message: `Starting auto-apply (${mode}) for ${total} scholarship(s)...`,
    error: null,
    total,
    done: 0,
    filled: 0,
    submitted: 0,
    failed: 0,
    results: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

export function updateApplyJob(partial) {
  job = { ...job, ...partial };
}

export function pushApplyResult(result) {
  job.results.push(result);
  job.done += 1;
  if (result.status === "Submitted") job.submitted += 1;
  else if (result.status === "Filled") job.filled += 1;
  else if (result.status === "Failed") job.failed += 1;
  job.message = `Processed ${job.done}/${job.total}: ${result.name || result.url}`;
}

export function finishApplyJob() {
  job = {
    ...job,
    running: false,
    message: `Done — filled ${job.filled}, submitted ${job.submitted}, failed ${job.failed}`,
    finishedAt: new Date().toISOString(),
  };
}

export function failApplyJob(error) {
  job = {
    ...job,
    running: false,
    error: error.message || String(error),
    message: `Failed: ${error.message || error}`,
    finishedAt: new Date().toISOString(),
  };
}
