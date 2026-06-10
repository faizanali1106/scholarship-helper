# Scholarship Helper

Chrome extension + local dashboard for scholarship applications. Profile, essay, and autofill are pre-loaded — the client only connects their tracker and installs the extension.

## Requirements

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Google Chrome**
- Scholarship list in **Google Sheets** (recommended) or the included **Excel** file

## Start

| Platform | Double-click |
|----------|--------------|
| Mac | `Start Scholarship Helper.command` |
| Windows | `Start Scholarship Helper.bat` |
| Any OS | `npm run launch` |

Keep the terminal window open while applying.

---

## Setup (3 steps in the dashboard)

Profile and essay are already in `data/profile.json` and `data/master-essay.txt`. The wizard only asks for:

1. **Tracker** — Google Sheet link + Apps Script URL, **or** use/upload the Excel file  
2. **Extension** — load the `extension/` folder in Chrome once  
3. **Apply** — click **Start Applying**, then use the Chrome extension  

Optional: add an OpenAI API key in Step 1 for AI-rewritten essays per scholarship. If the key is already in `.env`, the app shows **AI essays configured** — no need to paste it again.

---

## Google Sheets (recommended)

1. Open your Google Sheet with scholarship URLs  
2. **Extensions → Apps Script**  
3. Paste code from `google-apps-script/scholarship-tracker.gs`  
4. **Deploy → Web app** → access: **Anyone**  
5. In setup Step 1, paste the Sheet link and web app URL  
6. Click **Test connection**

**Sheet columns:** Scholarship Name, Website (or Application URL), Status

---

## Excel (included)

A sample tracker is at `data/tracker.xlsx`. To use Excel instead of Google Sheets:

1. Choose **Excel file** in Step 1  
2. Upload your `.xlsx` or keep the default path  
3. Click **Test connection**

---

## Applying (each scholarship)

1. Dashboard → **Start Applying** (loads **Master Tracker** scraped links)  
2. Chrome extension → **Open From List** (or paste a URL)  
3. Log in and navigate to the **application form**  
4. **Fill This Page** in the extension  
5. Submit on the website → **I'm Done — Submitted**  

The bot does **not** create accounts or bypass CAPTCHAs.

---

## Scrape scholarships → Google Sheet

| Site | How to scrape |
|------|----------------|
| **Bold.org** | Chrome extension → **Apply & Scrape** (CAPTCHA manual) |
| **Fastweb** | Dashboard Step 3 → **Scrape Fastweb** |
| **Niche.com** | Dashboard Step 3 → **Scrape Niche.com** |
| **Diabetes Scholars** | Dashboard Step 3 → **Scrape Diabetes Scholars** |

All scraped rows go to the **Master Tracker** tab. See `REQUIREMENTS_FROM_YOU.md` for setup.

First time scrapers: `npm run setup:scrapers`

---

## Demo test (no scholarship account needed)

1. Install the Chrome extension  
2. Dashboard → **Open demo form** (Step 2 or Step 3)  
3. Extension → **Fill This Page**  

Uses a local sample form at `http://127.0.0.1:3847/demo-form.html` to verify profile + essay autofill.

---

## Folder guide

| Path | Purpose |
|------|---------|
| `extension/` | Chrome extension (load unpacked) |
| `data/profile.json` | Student info for autofill |
| `data/master-essay.txt` | Base essay |
| `data/tracker.xlsx` | Sample Excel tracker |
| `data/settings.json` | Saved setup (created on first run) |
| `google-apps-script/` | Code to paste into Google Sheets |

---

## Optional `.env`

```
OPENAI_API_KEY=sk-...
APP_PORT=3847
```

Or enter the OpenAI key in the setup wizard instead.
