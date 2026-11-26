import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Radio, Search } from 'lucide-react';
import type { ReviewsResponse } from '../../src/shared/api';
import type { StoredReview } from '../../src/shared/types';

export type FeedReview = StoredReview & { demo?: boolean };

export interface FeedFilters {
  search: string;
  sentiment: string;
  topic: string;
  sort: string;
}

interface Props {
  data: ReviewsResponse | null;
  loading: boolean;
  topics: { key: string; label: string }[];
  propertyNames: Record<string, string>;
  filters: FeedFilters;
  demoReviews: FeedReview[];
  demoLive: boolean;
  onToggleDemo: () => void;
  onFilterChange: (key: keyof FeedFilters, value: string) => void;
  onPageChange: (page: number) => void;
}

function scoreClass(score: number | null): string {
  if (score === null) return 'score-neutral';
  if (score >= 9) return 'score-great';
  if (score >= 7) return 'score-good';
  if (score >= 5) return 'score-ok';
  return 'score-poor';
}

function ReviewCard({
  review,
  topicLabels,
  propertyName,
}: {
  review: FeedReview;
  topicLabels: Record<string, string>;
  propertyName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={review.demo ? 'review-card demo' : 'review-card'}>
      <div className="review-card-head">
        <div className="review-meta">
          {review.demo && <span className="demo-pill"><Radio size={10} /> Simulated</span>}
          <span className="property-pill">{propertyName}</span>
          <span>{new Date(`${review.reviewDate}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
          <span className="muted">· {review.travelerType || 'Guest'}</span>
        </div>
        <span className={`score-badge ${scoreClass(review.score)}`}>{review.score === null ? '—' : review.score.toFixed(1)}</span>
      </div>

      <h3>{review.title || 'Untitled review'}</h3>

      {review.positiveText && (
        <p className="review-text positive"><span>What they liked</span>{review.positiveText}</p>
      )}
      {review.negativeText && (
        <p className="review-text negative"><span>What could improve</span>{review.negativeText}</p>
      )}

      <div className="review-card-foot">
        <div className="chips">
          {review.topics.slice(0, 5).map((topic) => (
            <span key={topic} className="chip">{topicLabels[topic] ?? topic}</span>
          ))}
        </div>
        <button type="button" className="link-button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {expanded ? 'Less detail' : 'More detail'}
          <ChevronDown size={14} className={expanded ? 'rotate' : ''} />
        </button>
      </div>

      {expanded && (
        <div className="review-details">
          <dl>
            <div><dt>Room</dt><dd>{review.roomType || 'Not stated'}</dd></div>
            <div><dt>Length of stay</dt><dd>{review.nights ? `${review.nights} night${review.nights === 1 ? '' : 's'}` : 'Not stated'}</dd></div>
            <div><dt>Stay date</dt><dd>{review.stayDate || 'Not stated'}</dd></div>
            <div><dt>Reviewer</dt><dd>{review.reviewerName || 'Anonymous'}{review.reviewerCountry ? ` · ${review.reviewerCountry}` : ''}</dd></div>
            <div><dt>Property reply</dt><dd>{review.hasPropertyReply ? 'Yes' : 'No'}</dd></div>
          </dl>
          <a href={review.sourceUrl} target="_blank" rel="noreferrer">View on Booking.com <ExternalLink size={12} /></a>
        </div>
      )}
    </article>
  );
}

export function ReviewFeed({
  data,
  loading,
  topics,
  propertyNames,
  filters,
  demoReviews,
  demoLive,
  onToggleDemo,
  onFilterChange,
  onPageChange,
}: Props) {
  const topicLabels = Object.fromEntries(topics.map((topic) => [topic.key, topic.label]));
  const items = [...demoReviews, ...(data?.items ?? [])].slice(0, data?.limit ?? 25);
  const total = (data?.total ?? 0) + demoReviews.length;

  return (
    <section className="panel feed-panel" id="review-feed">
      <div className="panel-head">
        <div>
          <h2>Review feed</h2>
          <p className="panel-subtitle">Browse the individual reviews behind the numbers.</p>
        </div>
        <span className="result-count" aria-live="polite">
          {loading ? (
            <span className="live-badge">Updating…</span>
          ) : (
            <><strong>{total}</strong> review{total === 1 ? '' : 's'} <span className="live-badge">Live</span></>
          )}
        </span>
      </div>

      <div className="feed-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search review text, room or reviewer…"
            value={filters.search}
            onChange={(event) => onFilterChange('search', event.target.value)}
            aria-label="Search reviews"
          />
        </label>
        <select value={filters.sentiment} onChange={(event) => onFilterChange('sentiment', event.target.value)} aria-label="Filter by sentiment">
          <option value="">All ratings</option>
          <option value="negative">Low-rated (≤6)</option>
          <option value="neutral">Mixed (7)</option>
          <option value="positive">Positive (≥8)</option>
        </select>
        <select value={filters.topic} onChange={(event) => onFilterChange('topic', event.target.value)} aria-label="Filter by topic">
          <option value="">All topics</option>
          {topics.map((topic) => <option key={topic.key} value={topic.key}>{topic.label}</option>)}
        </select>
        <select value={filters.sort} onChange={(event) => onFilterChange('sort', event.target.value)} aria-label="Sort reviews">
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="score_desc">Highest score</option>
          <option value="score_asc">Lowest score</option>
        </select>
        <button
          type="button"
          className={demoLive ? 'demo-button active' : 'demo-button'}
          onClick={onToggleDemo}
          aria-pressed={demoLive}
          title="Streams sample cards into this feed only. Nothing is stored or sent to Booking.com."
        >
          <Radio size={14} />
          {demoLive ? `Live demo · ${demoReviews.length}` : 'Live demo'}
        </button>
      </div>

      {loading && <p className="empty-state">Loading reviews…</p>}
      {!loading && items.length === 0 && (
        <p className="empty-state">No reviews match these filters. Try a wider date range or clear the search.</p>
      )}

      <div className="review-list">
        {items.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            topicLabels={topicLabels}
            propertyName={propertyNames[review.propertyId] ?? review.propertyId}
          />
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <nav className="pagination" aria-label="Review pages">
          <button type="button" onClick={() => onPageChange(data.page - 1)} disabled={data.page <= 1}>
            <ChevronLeft size={15} /> Previous
          </button>
          <span>Page {data.page} of {data.totalPages}</span>
          <button type="button" onClick={() => onPageChange(data.page + 1)} disabled={data.page >= data.totalPages}>
            Next <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </section>
  );
}
