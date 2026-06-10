import fs from "fs";
import path from "path";
import { config } from "./config.js";

const SETTINGS_PATH = path.join(config.root, "data/settings.json");

const DEFAULT_SETTINGS = {
  setupComplete: false,
  trackerType: "google",
  googleSheetUrl: "",
  googleAppsScriptUrl: "",
  excelPath: "data/tracker.xlsx",
  openaiApiKey: "",
  sourceSheetNames: [
    "Master Tracker",
    "Diabetes Scholarships",
    "Athlete Scholarships",
    "Scholarship Search Links",
  ],
  masterSheetName: "Master Tracker",
};

let cached = null;

export function loadSettings() {
  if (cached) return { ...cached };
  if (!fs.existsSync(SETTINGS_PATH)) {
    cached = { ...DEFAULT_SETTINGS };
    return { ...cached };
  }
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    cached = { ...DEFAULT_SETTINGS, ...data };
  } catch {
    cached = { ...DEFAULT_SETTINGS };
  }
  return { ...cached };
}

export function saveSettings(partial) {
  const current = loadSettings();
  const merged = { ...current };
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) merged[key] = value;
  }
  cached = merged;
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cached, null, 2));
  return { ...cached };
}

export function isValidOpenAiKey(key) {
  if (!key || typeof key !== "string") return false;
  const k = key.trim();
  if (k.length < 20) return false;
  if (!k.startsWith("sk-")) return false;
  if (/your[- ]?key|sk-your|example|placeholder|replace/i.test(k)) return false;
  return true;
}

export function getOpenAiKey() {
  const settings = loadSettings();
  if (isValidOpenAiKey(settings.openaiApiKey)) return settings.openaiApiKey.trim();
  if (isValidOpenAiKey(config.openaiApiKey)) return config.openaiApiKey.trim();
  return "";
}

export function getOpenAiKeyInfo() {
  const settings = loadSettings();
  if (isValidOpenAiKey(settings.openaiApiKey)) {
    return { configured: true, source: "settings" };
  }
  if (isValidOpenAiKey(config.openaiApiKey)) {
    return { configured: true, source: "env" };
  }
  return { configured: false, source: null };
}

export function getExcelPath() {
  const settings = loadSettings();
  const p = settings.excelPath || DEFAULT_SETTINGS.excelPath;
  return path.isAbsolute(p) ? p : path.join(config.root, p);
}

export function maskSettings(settings) {
  const copy = { ...settings };
  const keyInfo = getOpenAiKeyInfo();
  copy.hasOpenAiKey = keyInfo.configured;
  copy.openAiKeySource = keyInfo.source;
  delete copy.openaiApiKey;
  return copy;
}
