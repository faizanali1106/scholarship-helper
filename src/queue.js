import { loadSettings } from "./settings.js";
import { loadScholarships, updateScholarshipStatus } from "./tracker.js";

export class ScholarshipQueue {
  constructor() {
    this.scholarships = [];
    this.index = 0;
    this.active = false;
    this.logs = [];
  }

  log(text) {
    const line = `[${new Date().toLocaleTimeString()}] ${text}`;
    this.logs.push(line);
    if (this.logs.length > 30) this.logs.shift();
  }

  getStatus() {
    const current = this.getCurrent();
    return {
      active: this.active,
      index: this.index,
      total: this.scholarships.length,
      current,
      remaining: Math.max(0, this.scholarships.length - this.index),
      completed: this.index,
      logs: this.logs.slice(-15),
    };
  }

  getCurrent() {
    return this.scholarships[this.index] || null;
  }

  async start({ limit = null, sheet = null } = {}) {
    const settings = loadSettings();
    let sheetNames = sheet ? [sheet] : [settings.masterSheetName || "Master Tracker"];
    let list = await loadScholarships(sheetNames);

    if (!sheet && list.length === 0) {
      sheetNames = settings.sourceSheetNames || sheetNames;
      list = await loadScholarships(sheetNames);
    }

    if (limit != null) list = list.slice(0, limit);

    this.scholarships = list;
    this.index = 0;
    this.active = list.length > 0;
    this.logs = [];

    if (list.length) {
      this.log(`Queue started — ${list.length} scholarship(s).`);
    } else {
      this.log("No scholarships found.");
    }

    return this.getStatus();
  }

  async mark(action, url = null) {
    let scholarship = this.getCurrent();

    if (!scholarship && url) {
      scholarship = this.scholarships.find((s) => s.website === url) || {
        name: url,
        website: url,
        sheet: "Manual",
      };
    }

    if (!scholarship) {
      throw new Error("No scholarship in queue. Start the queue first.");
    }

    if (action === "submitted") {
      await updateScholarshipStatus(
        scholarship,
        "Submitted",
        new Date().toISOString()
      );
      this.log(`Submitted: ${scholarship.name}`);
    } else if (action === "skip") {
      await updateScholarshipStatus(scholarship, "Skipped", "Skipped by user");
      this.log(`Skipped: ${scholarship.name}`);
    } else if (action === "progress") {
      await updateScholarshipStatus(
        scholarship,
        "In Progress",
        "Opened via extension"
      );
      return this.getStatus();
    }

    if (this.getCurrent()?.website === scholarship.website) {
      this.index += 1;
    }

    if (this.index >= this.scholarships.length) {
      this.active = false;
      this.log("Queue complete!");
    }

    return this.getStatus();
  }

  reset() {
    this.scholarships = [];
    this.index = 0;
    this.active = false;
    this.logs = [];
  }
}

export const queue = new ScholarshipQueue();

export function extractEssayContextFromText(pageText) {
  const normalized = String(pageText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const promptPatterns = [
    /(?:essay prompt|prompt|describe|tell us|write about|explain)[^.!?]{0,300}[.!?]/gi,
    /(?:why|how)[^.!?]{0,250}[?]/gi,
  ];

  const snippets = [];
  for (const pattern of promptPatterns) {
    const matches = normalized.match(pattern) || [];
    snippets.push(...matches.slice(0, 3));
  }

  const wordLimitMatch = normalized.match(
    /(\d{2,4})\s*(?:word|words)\s*(?:limit|max|maximum|minimum)?/i
  );
  const wordLimit = wordLimitMatch ? Number(wordLimitMatch[1]) : null;

  const scholarshipDetails =
    snippets.join(" ").trim() ||
    normalized.slice(0, 1200) ||
    "General scholarship application essay";

  return { scholarshipDetails, wordLimit };
}
