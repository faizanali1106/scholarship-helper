# How to run the app (turnkey)

The app installs everything it needs on the **first run**. No Google account
or technical setup is required — scholarships are saved inside the app itself.

## Start it (1 step)

1. **Node.js 18+** installed (one-time, https://nodejs.org)
2. In the project folder run:

```
npm start
```

(or double-click **`Start Scholarship Helper.command`** on Mac)

The first run auto-installs dependencies + the browser engine (1–2 min), then
opens the dashboard at `http://localhost:3847`. Every run after that is instant.

## Daily workflow (all from the dashboard)

1. **Step 3 → Scrape** a site:
   - **Fastweb / Niche / Diabetes Scholars** → click the scrape button
   - **Bold.org** → use the Chrome extension (login + CAPTCHA you solve once)
2. Scholarships are saved automatically inside the app.
3. **Auto-apply** section:
   - **Auto-fill forms (review)** → the app opens each form and fills it; you review and submit
   - **Auto-fill + Submit** → the app fills and clicks submit too
   - Tick **Show browser window** to watch it work; set a **Limit** to test a few first
4. Each result shows status + a screenshot link.

## Profile / essay

- Student details live in `data/profile.json` (name, email, GPA, major, essay).
- Edit that file once and every form is filled from it.

## OpenAI key (optional)

- Add it in dashboard Step 1 (or `.env`) to auto-tailor the essay per scholarship.
- Without a key, the master essay is used. Everything else works the same.

## Google Sheet (optional)

- Only if the client wants a shared sheet: set the Sheet + Apps Script URL in Step 1.
- When connected, scraped scholarships also sync to the **Master Tracker** tab.
- Not required — the app works fully without it.

## What is NOT fully automatic (by design)

- CAPTCHA / logins (Bold and some sites) — you handle these.
- Sites that require an account before the form loads are flagged "Login required".
- Sites occasionally change layout — a scraper/selector update may be needed.
