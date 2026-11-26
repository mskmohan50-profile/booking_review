Azzurro Hotels: Booking.com Review Insights

A local app that collects public Booking.com reviews for four Azzurro Hotels properties and shows weekly sentiment and recurring issues in an ops-friendly dashboard.

Quick start (Node 22+, npm, Chrome or Playwright Chromium)

bash
npm install
npm run scrape      # collect reviews
npm run dev         # API :3001, dashboard :5173

For a single served build, run npm run build && npm start (http://localhost:3001). A snapshot of 549 real reviews is included, so the dashboard works immediately.

How it works

Playwright drives a real Chrome session, because Booking.com's WAF blocks plain HTTP clients. It reads reviews newest-first via stable data-testid hooks, with no login or CAPTCHA solving.
Reviews go into SQLite, deduplicated by a SHA-256 fingerprint. Re-runs are safe, and later runs stop early when a page has nothing new (--full forces a rescan).
Each run is logged per property, and a failure in one property doesn't lose the others' data.

Insights

Scores are banded as ≤6 low-rated, 7 mixed, ≥8 positive.
Weeks run Monday to Sunday in Sydney time, and an incomplete week is compared against an equal-length previous window.
Topics (cleanliness, check-in, staff, noise, and so on) come from transparent keyword rules, not an AI model. Treat percentages as a triage signal, since one review can carry several topics.

Dashboard

Filters by period and property, KPI cards, issue spotlight, trend charts, and a searchable review feed that links back to the source.
It auto-checks for new reviews every 15 minutes and shows live scrape status.
Both the "Live demo" toggle (simulated cards, nothing stored) and the manual scrape button (ENABLE_SCRAPE_TRIGGER=0 disables it) are optional.

Limits

This is screen scraping, not a supported API, so layout changes or challenges can cause failed runs (visible in the dashboard).
Confirm your use complies with Booking.com's terms.

Commands: npm test runs the unit tests, and npm run build does the type check and production build.
