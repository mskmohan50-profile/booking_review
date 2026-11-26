import { Info } from 'lucide-react';

export function Methodology() {
  return (
    <details className="methodology panel">
      <summary><Info size={16} /> How these insights are calculated</summary>
      <div className="methodology-body">
        <div>
          <h3>Collection</h3>
          <p>
            Reviews are read from the public Booking.com guest-review tab for each property using a real Chromium
            browser. The collector opens the reviews tab, sorts by “Newest first”, reads ten reviews per page and
            stores them in SQLite. A SHA-256 fingerprint prevents duplicates; later runs stop early once a page has
            no new reviews.
          </p>
        </div>
        <div>
          <h3>Ratings and sentiment</h3>
          <p>
            Booking.com scores are out of 10. “Low-rated” means ≤6, “mixed” is 7 and “positive” is ≥8. Weekly figures
            use Monday–Sunday in the properties’ local timezone (Australia/Sydney). The comparison window has the same
            number of days as the selected window, so a partial week is compared fairly.
          </p>
        </div>
        <div>
          <h3>Topics</h3>
          <p>
            Each review is tagged with transparent keyword rules. Issue topics only look at the review title and the
            “what could be improved” text; praise topics only look at the title and the “what they liked” text. One
            review can appear in several topics, so percentages may add up to more than 100%.
          </p>
        </div>
        <div>
          <h3>Limitations</h3>
          <p>
            Booking.com can change its layout or introduce an anti-bot challenge; the collector then records a failed
            run and keeps the last good dataset. Keyword rules can miss sarcasm or unusual wording and can group
            related topics together. Only publicly visible reviews are collected — no login, private data or API key is
            used. Treat the figures as an operational signal, not an exact science.
          </p>
        </div>
      </div>
    </details>
  );
}
