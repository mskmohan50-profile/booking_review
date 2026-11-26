# Azzurro Hotels — Booking.com Review Insights

A small, self-contained application that collects publicly visible Booking.com guest reviews for four Azzurro Hotels properties, stores them locally, and presents weekly sentiment and recurring operational issues in an operations-friendly dashboard.

---

## 1. Quick start

Requirements: **Node.js 22+** (developed and verified on Node 24), npm, and Google Chrome or a Playwright Chromium browser.

```bash
cd azzurro-review-insights
npm install
npm run scrape          # collect reviews from all four properties
npm run dev             # API on :3001, dashboard on :5173
```

Open **http://localhost:5173** in a browser.

For a single command that serves the pre-built dashboard:

```bash
npm run build
npm start               # http://localhost:3001
```

The repository already includes a snapshot of **549 real reviews** in `data/reviews.db` and `data/sample-reviews.json`, so the dashboard works immediately after installation even if Booking.com is temporarily unreachable.

---

## 2. What is included

| Path | Purpose |
| --- | --- |
| `src/scraper/` | Browser-based collector, DOM parsers, fingerprinting, SQLite storage, CLI |
| `src/server/` | Express API and analytics calculations |
| `src/shared/` | Property list, date helpers, topic rules and shared API types |
| `web/` | React + TypeScript dashboard (Vite), including the supplied logo in `web/public/book-logo.png` |
| `data/reviews.db` | SQLite dataset (sample snapshot, safe to commit) |
| `data/sample-reviews.json` | Portable JSON export of the same reviews |
| `tests/` | Unit tests for dates, sentiment bands, topic rules and dedupe keys |

---

## 3. Review collection method

Booking.com serves an AWS WAF JavaScript challenge to plain HTTP clients, so `fetch`/`curl` receives a challenge page instead of reviews. The collector therefore uses **Playwright driving a real Chrome browser** with a persistent local profile:

1. Navigate to Booking.com's dedicated reviews URL for the property, which redirects to the hotel page with a fresh session.
2. Wait for the challenge to clear and the hotel page to render (no manual challenge-solving or login is attempted).
3. Open the "all guest reviews" tab and set the sorter to **Newest first**.
4. Read each page of ten review cards using stable `data-testid` hooks such as `review-card`, `review-date`, `review-score`, `review-positive-text` and `review-negative-text`. Hashed CSS class names are deliberately not used.
5. Store review text, score, review date, stay month, room type, length of stay, traveller type, reviewer country, property reply flag and source URL.
6. Compute a SHA-256 fingerprint from `property + reviewer + review date + score + title + room type`. `INSERT OR IGNORE` makes re-runs idempotent.
7. Record one row per property in `collection_runs`, including pages read, reviews found, new reviews and any error. A failed property does not discard data already collected for the others.
8. Snapshot Booking.com's own category scores (Staff, Cleanliness, Facilities, etc.) at each run.

On later runs the collector stops a property early when a whole page contains no previously unseen review. Because reviews are sorted newest-first, older pages cannot contain new reviews. Use `--full` to force a complete rescan.

### Running the collector

```bash
npm run scrape                                   # all four properties
npm run scrape -- --property potts-point          # one property
npm run scrape -- --max-pages 3                   # limit pages per property
npm run scrape -- --since 2026-10-01              # stop when older reviews appear
npm run scrape -- --full                          # ignore the incremental early stop
npm run scrape -- --headed                        # show the browser window
npm run scrape -- --delay 1200                    # slower, more conservative pacing
npm run scrape -- --help                          # all options
```

Default minimum delay between pages is 900 ms plus small jitter; properties are processed one at a time, in one browser session. This keeps traffic low and predictable. The browser profile lives in `data/browser-profile/` and is git-ignored because it can contain an anonymous WAF clearance cookie.

### Reliability, limitations and assumptions

- **Layout changes:** Booking.com can rename test ids or change the tab interaction. Parsing then fails visibly (a failed run is logged) rather than silently storing bad data. Fixing it is a small, local change to `src/scraper/dom.js` / `browser.ts`.
- **Anti-bot challenges:** If Booking.com asks for a manual interaction, the run records a challenge error. Re-run with `--headed`; no automated CAPTCHA solving is performed. Existing data is preserved.
- **No API and no guarantee:** This is screen scraping of a public page, not a supported data feed. Partial failures are expected occasionally; the dashboard shows the last successful collection time and per-property run status.
- **Review coverage:** Each property has hundreds or thousands of reviews. By default the CLI reads up to 30 pages (300 reviews) and the dashboard's refresh button reads 10 pages (100 reviews) per property. Increase `--max-pages` for a deeper historical backfill.
- **Dates:** Booking.com exposes only a calendar day, not a timestamp. All period maths uses plain dates in Australia/Sydney time.
- **Politeness and terms:** The collector reads only public review pages at low volume and does not bypass logins, paywalls or access controls. Anyone deploying it should confirm their use complies with Booking.com's current terms.

---

## 4. Insights methodology

**Sentiment bands.** Booking.com scores are out of 10. `≤6` is "low-rated / needs attention", `7` is "mixed", and `≥8` is "positive". The dashboard labels these explicitly instead of claiming a general-purpose sentiment model.

**Weekly comparison.** Weeks are Monday–Sunday in Australia/Sydney. If the current week is incomplete, the previous window uses the same number of days, so the comparison is fair. "This week" and "last week" KPI cards are always shown; the rest of the dashboard follows the selected period and property filters.

**Topic grouping.** `src/shared/topics.ts` contains rules for Cleanliness, Check-in experience, Staff & reception, Noise, Facilities, Location, Room condition, Value for money, Comfort, Wi-Fi, Bathroom and Safety. Each rule is a readable regular expression with a short description. A small negation guard prevents phrases such as "no noise" from being counted as a noise complaint, with overrides for "not clean" and similar issue phrases.

- Issue topics are derived **only** from the review title and Booking.com's "what could be improved" text.
- Praise topics are derived **only** from the title and "what they liked" text.
- A review can carry several topics, so topic percentages can sum to more than 100%. They answer "what share of low-rated reviews mentioned X", not "what share of complaints were about X".
- Percentages include a change versus the preceding equal-length window where data is available.

**Why keyword rules?** They are deterministic, explainable to operations staff, require no external AI service or API key, and can be audited or extended in one file. The trade-off is that sarcasm, unusual phrasing and overlapping concepts can be missed or double-counted. Treat topic percentages as a triage signal and click through to the underlying reviews.

Example output produced by the API: *"67% of low-rated reviews in the selected period mentioned check-in experience concerns."*

---

## 5. Dashboard

The dashboard is designed for non-technical operations staff:

- **Filters:** This week, Last week, Last 30 days, All time, custom dates, and a property dropdown.
- **KPIs:** average rating this week with a comparison to last week, number of reviews, share of low-rated reviews with period-over-period change, and properties reporting.
- **Insight spotlight:** the most common issue in low-rated reviews, plus the top issue for each property. Clicking a property or topic drills straight into the review feed.
- **Charts:** rating by property (including Booking.com's own category subscores in the underlying data), eight-week rating trend, low-rated share trend and the rating distribution.
- **Review feed:** searchable, sortable and filterable list with expandable detail and a link back to the source page. Search, filters, topic drill-downs and sorting update the feed live without a page reload.
- **Live scrape status:** the filter bar polls `GET /api/status` every 2.5 seconds and shows the current collection message, last result, next automatic check and any error. The top bar switches to "Collecting reviews…" while a run is active.
- **Automatic review checks:** the server starts an incremental scrape every 15 minutes by default and refreshes the dashboard when it finishes. Set `AUTO_REFRESH=0` to disable, or `AUTO_REFRESH_MS` / `AUTO_REFRESH_MAX_PAGES` to tune the interval and depth.
- **"Live demo" toggle:** in the review feed, streams clearly labelled *Simulated* sample cards into the visible feed every four seconds. It is a UI-only demonstration; nothing is stored, sent to Booking.com or counted in the analytics.
- **"Check for new reviews" button:** triggers the collector through `POST /api/scrape` and refreshes the dashboard. Set `ENABLE_SCRAPE_TRIGGER=0` to disable this endpoint in a shared deployment.

Empty states are intentional: if a week has no reviews, the dashboard says so rather than showing misleading zeros. Use "Last 30 days" for a broader view.

---

## 6. API and architecture

The Express API reads directly from SQLite on each request, which is easily fast enough for a few thousand reviews.

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/status` | Live scrape state, last result and next automatic check |
| `GET /api/meta` | Properties, topic definitions, freshness, recent collection runs |
| `GET /api/summary?from=&to=&property=` | KPIs, property breakdown, trends, distribution |
| `GET /api/insights?from=&to=&property=` | Topic percentages, deltas, quotes, spotlight |
| `GET /api/reviews?from=&to=&property=&sentiment=&topic=&search=&sort=&page=&limit=` | Paginated review feed |
| `POST /api/scrape` | Operator-triggered collection (local/trusted networks) |

All date parameters are inclusive `YYYY-MM-DD` strings. In development Vite proxies `/api` to the Express server; in production Express serves the built React app from `web/dist`.

**Data flow:** `Booking.com public pages → Playwright collector → SQLite (dedupe + run log) → analytics layer → JSON API → React dashboard`, with the dashboard polling `/api/status` for live collection progress and reloading analytics when a run completes.

---

## 7. Tests and maintenance

```bash
npm test            # date windows, sentiment bands, topic rules, fingerprint stability
npm run build       # TypeScript check + production frontend build
```

To update the portable sample after a new collection:

```bash
npm run scrape                  # CLI exports data/sample-reviews.json automatically
```

No passwords, API keys or personal credentials are required by this project. Reviewer names are displayed exactly as Booking.com publishes them publicly; no contact details or private guest information are collected.
