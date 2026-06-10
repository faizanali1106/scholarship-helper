import { api } from "./app.js";
import {
  applyStatuses,
  buildSummary,
  exportBackup,
  getCachedList,
  importBackup,
  mergeLists,
  migrateFromServerRows,
  saveCachedList,
  setStatus,
} from "./status-store.js";

const $ = (id) => document.getElementById(id);

let scholarships = [];
let scrapePollTimer = null;

const PAGE_META = {
  scholarships: {
    eyebrow: "Dashboard",
    title: "Scholarship checklist",
    showFind: true,
  },
  profile: {
    eyebrow: "Apply faster",
    title: "Profile cheat sheet",
    showFind: false,
  },
  essays: {
    eyebrow: "Personalize",
    title: "Essay toolkit",
    showFind: false,
  },
};

// ---- Navigation ----
function showTab(name) {
  document.querySelectorAll(".view-panel").forEach((p) => p.classList.add("hidden"));
  $(`panel-${name}`)?.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });

  const meta = PAGE_META[name] || PAGE_META.scholarships;
  $("headerEyebrow").textContent = meta.eyebrow;
  $("pageTitle").textContent = meta.title;
  $("headerActions")?.classList.toggle("hidden", !meta.showFind);

  closeSidebar();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

function openSidebar() {
  $("sidebar")?.classList.add("open");
  $("sidebarBackdrop")?.classList.add("open");
}

function closeSidebar() {
  $("sidebar")?.classList.remove("open");
  $("sidebarBackdrop")?.classList.remove("open");
}

$("menuToggle")?.addEventListener("click", openSidebar);
$("sidebarBackdrop")?.addEventListener("click", closeSidebar);

// ---- Copy helpers ----
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      btn.classList?.add("copied");
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList?.remove("copied");
      }, 1500);
    }
  } catch {
    alert("Copy failed — select the text manually.");
  }
}

function showFeedback(id, text, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function initials(name) {
  return String(name || "S")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function statusClass(status) {
  if (status === "Submitted") return "status-submitted";
  if (status === "In Progress") return "status-progress";
  return "";
}

// ---- Scholarships ----
function renderStats(summary) {
  const total = summary.total || 0;
  const done = summary.submitted || 0;
  const todo =
    (summary.notStarted || 0) + (summary.inProgress || 0) + (summary.failed || 0);
  const match = scholarships.filter((s) => (s.matchScore || 0) >= 3).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  $("statTotal").textContent = total;
  $("statTodo").textContent = todo;
  $("statDone").textContent = done;
  $("statMatch").textContent = match;
  $("navBadgeTotal").textContent = total;
  $("miniTodo").textContent = todo;
  $("miniDone").textContent = done;
  $("miniMatch").textContent = match;
  $("progressPct").textContent = `${pct}%`;
  $("progressFill").style.width = `${pct}%`;
}

function filteredScholarships() {
  const tag = $("filterTag")?.value || "";
  const status = $("filterStatus")?.value || "";
  const q = ($("searchQuery")?.value || "").trim().toLowerCase();

  return scholarships.filter((s) => {
    if (status && s.status !== status) return false;
    if (tag === "match" && (s.matchScore || 0) < 3) return false;
    if (tag && tag !== "match" && !(s.matchTags || []).includes(tag)) return false;
    if (q) {
      const hay = [s.name, s.organization, s.description, s.source, ...(s.matchTags || [])]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function statusOptions(current) {
  const opts = ["Not Started", "In Progress", "Submitted", "Skipped"];
  return opts
    .map((o) => `<option value="${o}"${o === current ? " selected" : ""}>${o}</option>`)
    .join("");
}

function renderScholarshipList() {
  const list = $("scholarshipList");
  const items = filteredScholarships();

  $("resultCount").textContent = `${items.length} scholarship${items.length === 1 ? "" : "s"}`;

  if (!scholarships.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎓</div>
      <h4>No scholarships yet</h4>
      <p>Click <strong>Find scholarships</strong> to import matches for diabetes, athlete, Ohio & marketing.</p>
    </div>`;
    return;
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <h4>No matches</h4>
      <p>Try clearing your search or filters.</p>
    </div>`;
    return;
  }

  list.innerHTML = items
    .map((s) => {
      const tags = (s.matchTags || []).map((t) => `<span class="tag">${t}</span>`).join("");
      const score =
        (s.matchScore || 0) >= 3
          ? `<span class="match-badge hot">${s.matchScore}★ match</span>`
          : s.matchScore
            ? `<span class="match-badge">${s.matchScore}★</span>`
            : "";
      return `<article class="sch-card ${statusClass(s.status)}" data-url="${encodeURIComponent(s.url)}">
        <div class="sch-head">
          <h3>${escapeHtml(s.name || "Scholarship")}</h3>
          ${score}
        </div>
        <p class="sch-meta">${escapeHtml(s.organization || "—")}${s.amount ? ` · ${escapeHtml(s.amount)}` : ""}${s.deadline ? ` · Due ${escapeHtml(s.deadline)}` : ""}</p>
        <div class="tag-row">${tags}<span class="tag source">${escapeHtml(s.source || "")}</span></div>
        <div class="sch-actions">
          <a class="btn btn-accent btn-sm" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">Open ↗</a>
          <select class="status-select" data-url="${encodeURIComponent(s.url)}" aria-label="Status">${statusOptions(s.status)}</select>
        </div>
      </article>`;
    })
    .join("");

  list.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const url = decodeURIComponent(sel.dataset.url);
      const card = sel.closest(".sch-card");
      setStatus(url, sel.value);
      const item = scholarships.find((x) => x.url === url);
      if (item) item.status = sel.value;
      saveCachedList(scholarships);
      card?.classList.remove("status-submitted", "status-progress");
      card?.classList.add(statusClass(sel.value));
      renderStats(buildSummary(scholarships));
      // Best-effort server sync when running locally
      api("/api/scholarships/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, status: sel.value }),
      }).catch(() => {});
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function normalizeScholarshipRows(rows) {
  return (rows || []).map((s) => ({
    ...s,
    status: s.status === "Failed" ? "Not Started" : s.status || "Not Started",
  }));
}

async function refreshScholarships() {
  let serverList = [];
  try {
    const data = await api("/api/scholarships");
    serverList = normalizeScholarshipRows(data.scholarships);
    migrateFromServerRows(serverList);
  } catch {
    /* API unavailable (e.g. static Vercel) — use browser cache */
  }

  const merged = mergeLists(serverList, getCachedList());
  scholarships = applyStatuses(
    merged.map((s) => ({ ...s, status: s.status || "Not Started" }))
  );
  saveCachedList(scholarships);
  renderStats(buildSummary(scholarships));
  renderScholarshipList();
}

$("filterTag")?.addEventListener("change", renderScholarshipList);
$("filterStatus")?.addEventListener("change", renderScholarshipList);
$("searchQuery")?.addEventListener("input", renderScholarshipList);

// ---- Scrape ----
function setScrapeLoading(loading) {
  document.querySelectorAll(".scrape-btn, #btnFindForLuke, #btnFindForLukeSide").forEach((b) => {
    b.disabled = loading;
  });
}

async function pollScrapeJob() {
  try {
    const job = await api("/api/scrape/status");
    if (job.running) {
      showFeedback("scrapeStatus", job.message || "Finding scholarships...");
      return;
    }
    clearInterval(scrapePollTimer);
    scrapePollTimer = null;
    setScrapeLoading(false);
    if (job.error) {
      showFeedback("scrapeStatus", job.error, true);
      return;
    }
    const r = job.result || {};
    showFeedback("scrapeStatus", r.message || `Done — added ${r.synced ?? "?"} new scholarships`);
    await refreshScholarships();
  } catch (e) {
    clearInterval(scrapePollTimer);
    scrapePollTimer = null;
    setScrapeLoading(false);
    showFeedback("scrapeStatus", e.message, true);
  }
}

function startScrapePoll() {
  scrapePollTimer = setInterval(pollScrapeJob, 2000);
  pollScrapeJob();
}

async function runScrape(endpoint, body = {}) {
  setScrapeLoading(true);
  showFeedback("scrapeStatus", "Starting import...");
  try {
    await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    startScrapePoll();
  } catch (e) {
    setScrapeLoading(false);
    showFeedback("scrapeStatus", e.message, true);
  }
}

const findHandler = () => runScrape("/api/scrape/find-for-luke");
$("btnFindForLuke")?.addEventListener("click", findHandler);
$("btnFindForLukeSide")?.addEventListener("click", findHandler);

$("btnExportBackup")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(exportBackup(scholarships), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `scholarship-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showFeedback("scrapeStatus", "Backup downloaded — keep this file to restore on another device.");
});

$("backupFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    scholarships = importBackup(data);
    renderStats(buildSummary(scholarships));
    renderScholarshipList();
    showFeedback("scrapeStatus", `Restored ${scholarships.length} scholarships from backup.`);
  } catch (err) {
    showFeedback("scrapeStatus", err.message || "Invalid backup file", true);
  }
  e.target.value = "";
});

document.querySelectorAll(".scrape-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const site = btn.dataset.site;
    const body = {};
    if (btn.dataset.quick === "1") body.quick = true;
    if (btn.dataset.ohio === "1") {
      body.stateNames = ["Ohio Scholarships"];
      body.full = true;
    }
    runScrape(`/api/scrape/${site}`, body);
  });
});

// ---- Profile ----
const PROFILE_ROWS = [
  { label: "Full name", key: "fullName" },
  { label: "First name", key: "firstName" },
  { label: "Last name", key: "lastName" },
  { label: "Preferred name", key: "preferredName" },
  { label: "Email", key: "email" },
  { label: "Phone", key: "phone" },
  { label: "Street", key: "street", nested: true },
  { label: "City", key: "city", nested: true },
  { label: "State", key: "state", nested: true },
  { label: "ZIP", key: "zip", nested: true },
  { label: "Full address", key: "full", nested: true },
  { label: "High school", key: "highSchool" },
  { label: "GPA", key: "gpa" },
  { label: "Sports", key: "sports" },
  { label: "Intended major", key: "intendedMajor" },
  { label: "Career goals", key: "careerGoals" },
  { label: "Diabetes story", key: "diabetesStory" },
];

let profileData = null;

function profileValue(profile, row) {
  if (row.nested) {
    if (row.key === "full") return profile.address?.full || "";
    return profile.address?.[row.key] || "";
  }
  if (row.key === "sports") return (profile.sports || []).join(", ");
  return profile[row.key] || "";
}

function renderProfile(profile) {
  profileData = profile;
  $("profileFields").innerHTML = PROFILE_ROWS.map((row) => {
    const val = profileValue(profile, row);
    return `<button type="button" class="profile-field" data-key="${row.key}">
      <span class="pf-label">${row.label}</span>
      <span class="pf-value">${escapeHtml(val)}</span>
      <span class="pf-copy">Copy</span>
    </button>`;
  }).join("");

  $("profileFields").querySelectorAll(".profile-field").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = PROFILE_ROWS.find((r) => r.key === btn.dataset.key);
      copyText(profileValue(profile, row), btn.querySelector(".pf-copy"));
    });
  });
}

$("btnCopyAllProfile")?.addEventListener("click", () => {
  if (!profileData) return;
  const text = PROFILE_ROWS.map((r) => `${r.label}: ${profileValue(profileData, r)}`).join("\n");
  copyText(text, $("btnCopyAllProfile"));
});

// ---- Essays ----
function renderEssays(toolkit) {
  $("essayWordCount").textContent = `${toolkit.wordCount} words — personalize per prompt`;
  $("masterEssayPreview").textContent = toolkit.master;
  $("btnCopyEssay")?.addEventListener("click", () => copyText(toolkit.master, $("btnCopyEssay")));

  $("essayAngles").innerHTML = (toolkit.angles || [])
    .map(
      (a) => `<div class="angle-card">
        <h3>${escapeHtml(a.title)}</h3>
        <p class="angle-prompt">${escapeHtml(a.prompt)}</p>
        <p class="angle-snippet">${escapeHtml(a.snippet)}</p>
        <button type="button" class="btn btn-ghost btn-sm copy-angle">Copy angle</button>
      </div>`
    )
    .join("");

  $("essayAngles").querySelectorAll(".copy-angle").forEach((btn, i) => {
    btn.addEventListener("click", () => copyText(toolkit.angles[i].snippet, btn));
  });
}

// ---- Init ----
async function init() {
  const [info, profileRes, essayToolkit] = await Promise.all([
    api("/api/info"),
    api("/api/profile"),
    api("/api/essay/toolkit"),
  ]);

  const name = info.profileName || "Student";
  const first = profileRes.profile?.preferredName || profileRes.profile?.firstName || name.split(" ")[0];

  $("userName").textContent = name;
  $("userAvatar").textContent = initials(name);
  $("heroNote").textContent = `Welcome back, ${first}`;
  document.title = `Scholarship Hub — ${first}`;

  renderProfile(profileRes.profile);
  renderEssays(essayToolkit);
  showTab("scholarships");

  await refreshScholarships();
}

init().catch((e) => showFeedback("scrapeStatus", e.message, true));
