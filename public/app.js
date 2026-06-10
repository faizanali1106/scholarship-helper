export async function api(path, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(path, { ...fetchOptions, signal: controller.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out — scraping can take 1–2 minutes, please wait.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function renderQueue(queue) {
  if (!queue) return;

  const pct = queue.total ? Math.round((queue.index / queue.total) * 100) : 0;
  const bar = document.getElementById("progressBar");
  const pctEl = document.getElementById("progressPercent");
  const label = document.getElementById("progressLabel");
  const name = document.getElementById("currentName");
  const url = document.getElementById("currentUrl");

  if (bar) bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = queue.active ? `${pct}%` : "0%";
  if (label) {
    label.textContent = queue.total
      ? `${queue.index} of ${queue.total} done · ${queue.remaining} left`
      : "Click Start Applying to begin";
  }
  if (name) name.textContent = queue.current?.name || "Ready when you are";
  if (url) url.textContent = queue.current?.website || "Use the Chrome extension to open each site";
}

export async function poll() {
  try {
    const data = await api("/api/status");
    document.getElementById("serverDot")?.classList.add("on");
    document.getElementById("serverStatus").textContent = "Running";
    renderQueue(data.queue);
    return data;
  } catch {
    document.getElementById("serverDot")?.classList.remove("on");
    document.getElementById("serverStatus").textContent = "Error";
    return null;
  }
}
