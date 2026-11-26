import {
  addDays,
  daysInclusive,
  formatWeekLabel,
  isDateString,
  previousRange,
  recentWeeks,
  startOfWeek,
  toSydneyDate,
  weekRangeContaining,
} from '../shared/dates';
import { PROPERTIES } from '../shared/properties';
import { TOPICS } from '../shared/topics';
import type {
  InsightsResponse,
  PeriodStats,
  PropertyBreakdown,
  PropertyIssue,
  ReviewsResponse,
  SummaryResponse,
  TopicInsight,
} from '../shared/api';
import type { StoredReview } from '../shared/types';
import {
  getAllReviews,
  getFreshness,
  getLatestSnapshots,
  getRecentRuns,
  type Db,
} from '../scraper/store';

export interface QueryParams {
  from?: unknown;
  to?: unknown;
  property?: unknown;
  sentiment?: unknown;
  topic?: unknown;
  search?: unknown;
  sort?: unknown;
  page?: unknown;
  limit?: unknown;
}

function stringParam(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asDate(value: unknown, fallback: string): string {
  return isDateString(value) ? value : fallback;
}

/** All API date ranges are inclusive at both ends. */
export function resolveRange(params: QueryParams): { from: string; to: string } {
  const today = toSydneyDate();
  const week = weekRangeContaining(today);
  return {
    from: asDate(params.from, startOfWeek(today)),
    to: asDate(params.to, today),
  };
}

export function reviewsInRange(reviews: StoredReview[], from: string, to: string, propertyId = ''): StoredReview[] {
  return reviews.filter(
    (review) => review.reviewDate >= from && review.reviewDate <= to && (!propertyId || review.propertyId === propertyId),
  );
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function periodStats(reviews: StoredReview[], from: string, to: string, label = 'period'): PeriodStats {
  const scores = reviews.map((review) => review.score).filter((score): score is number => score !== null);
  const negativeCount = reviews.filter((review) => review.sentiment === 'negative').length;
  const positiveCount = reviews.filter((review) => review.sentiment === 'positive').length;
  const count = reviews.length;
  return {
    from,
    to,
    label,
    reviewCount: count,
    averageScore: scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2) : null,
    negativeCount,
    negativePct: count ? round((negativeCount / count) * 100) : null,
    positiveCount,
    positivePct: count ? round((positiveCount / count) * 100) : null,
  };
}

function previousStats(reviews: StoredReview[], from: string, to: string, propertyId = ''): PeriodStats {
  const window = previousRange(from, to);
  const previousTo = addDays(window.toExclusive, -1);
  return periodStats(reviewsInRange(reviews, window.from, previousTo, propertyId), window.from, previousTo, 'previous');
}

export function buildSummary(db: Db, params: QueryParams): SummaryResponse {
  const reviews = getAllReviews(db);
  const { from, to } = resolveRange(params);
  const propertyId = stringParam(params.property);
  const rangeReviews = reviewsInRange(reviews, from, to, propertyId);
  const current = periodStats(rangeReviews, from, to, 'current');
  const previous = previousStats(reviews, from, to, propertyId);

  const today = toSydneyDate();
  const thisWeek = weekRangeContaining(today);
  const lastWeekFrom = addDays(thisWeek.from, -7);
  const lastWeekTo = addDays(thisWeek.from, -1);

  const snapshots = getLatestSnapshots(db);
  const snapshotByProperty = new Map(snapshots.map((snapshot) => [snapshot.propertyId, snapshot]));

  const propertyBreakdown: PropertyBreakdown[] = PROPERTIES.filter(
    (property) => !propertyId || property.id === propertyId,
  ).map((property) => {
    const propertyReviews = reviewsInRange(reviews, from, to, property.id);
    const stats = periodStats(propertyReviews, from, to, property.id);
    const previousProperty = previousStats(reviews, from, to, property.id);
    return {
      ...stats,
      propertyId: property.id,
      name: property.name,
      shortName: property.shortName,
      accent: property.accent,
      previousAverage: previousProperty.averageScore,
      delta: stats.averageScore !== null && previousProperty.averageScore !== null
        ? round(stats.averageScore - previousProperty.averageScore, 2)
        : null,
      latestSubscores: snapshotByProperty.get(property.id)?.subscores ?? [],
    };
  });

  const weeks = recentWeeks(to, 8);
  const weeklyTrend = weeks.map((week) => {
    const weekReviews = reviewsInRange(reviews, week.from, addDays(week.toExclusive, -1), propertyId);
    const stats = periodStats(weekReviews, week.from, addDays(week.toExclusive, -1), 'week');
    return {
      weekStart: week.from,
      label: formatWeekLabel(week.from),
      averageScore: stats.averageScore,
      reviewCount: stats.reviewCount,
    };
  });

  const sentimentTrend = weeks.map((week) => {
    const weekReviews = reviewsInRange(reviews, week.from, addDays(week.toExclusive, -1), propertyId);
    const stats = periodStats(weekReviews, week.from, addDays(week.toExclusive, -1), 'week');
    return { weekStart: week.from, label: formatWeekLabel(week.from), negativePct: stats.negativePct, reviewCount: stats.reviewCount };
  });

  const buckets = [
    { label: '9–10', min: 9, max: 10 },
    { label: '7–8', min: 7, max: 8 },
    { label: '5–6', min: 5, max: 6 },
    { label: '3–4', min: 3, max: 4 },
    { label: '1–2', min: 1, max: 2 },
  ];
  const ratingDistribution = buckets.map((bucket) => ({
    label: bucket.label,
    count: rangeReviews.filter((review) => review.score !== null && review.score >= bucket.min && review.score <= bucket.max).length,
  }));

  return {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    thisWeek: periodStats(reviewsInRange(reviews, thisWeek.from, today, propertyId), thisWeek.from, today, 'This week'),
    lastWeek: periodStats(reviewsInRange(reviews, lastWeekFrom, lastWeekTo, propertyId), lastWeekFrom, lastWeekTo, 'Last week'),
    current,
    previous,
    propertyBreakdown,
    weeklyTrend,
    sentimentTrend,
    ratingDistribution,
    freshness: getFreshness(db),
    snapshots,
  };
}

function topicInsights(
  reviews: StoredReview[],
  field: 'negativeTopics' | 'positiveTopics',
  previousReviews: StoredReview[],
): TopicInsight[] {
  return TOPICS.map((topic) => {
    const matching = reviews.filter((review) => review[field].includes(topic.key));
    const previousMatching = previousReviews.filter((review) => review[field].includes(topic.key));
    const pct = reviews.length ? round((matching.length / reviews.length) * 100) : null;
    const previousPct = previousReviews.length ? round((previousMatching.length / previousReviews.length) * 100) : null;
    const sample = matching.find((review) => (field === 'negativeTopics' ? review.negativeText : review.positiveText).length > 20);
    const quote = sample ? field === 'negativeTopics' ? sample.negativeText || sample.title : sample.positiveText || sample.title : null;
    return {
      key: topic.key,
      label: topic.label,
      description: topic.description,
      count: matching.length,
      pct,
      previousPct,
      deltaPp: pct !== null && previousPct !== null ? round(pct - previousPct) : null,
      exampleQuote: quote ? `${quote.slice(0, 220)}${quote.length > 220 ? '…' : ''}` : null,
    };
  })
    .filter((topic) => topic.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildInsights(db: Db, params: QueryParams): InsightsResponse {
  const reviews = getAllReviews(db);
  const { from, to } = resolveRange(params);
  const propertyId = stringParam(params.property);
  const rangeReviews = reviewsInRange(reviews, from, to, propertyId);
  const window = previousRange(from, to);
  const previousReviews = reviewsInRange(reviews, window.from, addDays(window.toExclusive, -1), propertyId);

  const negativeReviews = rangeReviews.filter((review) => review.sentiment === 'negative');
  const positiveReviews = rangeReviews.filter((review) => review.sentiment === 'positive');
  const negativeTopics = topicInsights(negativeReviews, 'negativeTopics', previousReviews.filter((review) => review.sentiment === 'negative'));
  const positiveTopics = topicInsights(positiveReviews, 'positiveTopics', previousReviews.filter((review) => review.sentiment === 'positive'));

  const top = negativeTopics[0];
  const spotlight = top && top.pct !== null
    ? `${top.pct}% of low-rated reviews in the selected period mentioned ${top.label.toLowerCase()} concerns.`
    : negativeReviews.length === 0
      ? 'No low-rated reviews were published in this period — nothing to escalate.'
      : 'Low-rated reviews were recorded, but no recurring operational topic was detected.';

  const perProperty: PropertyIssue[] = PROPERTIES.filter(
    (property) => !propertyId || property.id === propertyId,
  ).map((property) => {
    const propertyNegative = negativeReviews.filter((review) => review.propertyId === property.id);
    const counts = new Map<string, number>();
    for (const review of propertyNegative) {
      for (const key of review.negativeTopics) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const definition = sorted.length ? TOPICS.find((topic) => topic.key === sorted[0][0]) : undefined;
    return {
      propertyId: property.id,
      name: property.shortName,
      topicKey: definition?.key ?? null,
      topicLabel: definition?.label ?? null,
      negativeCount: propertyNegative.length,
      topCount: sorted[0]?.[1] ?? 0,
    };
  });

  return {
    range: { from, to },
    negativeCount: negativeReviews.length,
    negativePct: rangeReviews.length ? round((negativeReviews.length / rangeReviews.length) * 100) : null,
    positiveCount: positiveReviews.length,
    negativeTopics,
    positiveTopics,
    spotlight,
    perProperty,
  };
}

export function queryReviews(db: Db, params: QueryParams): ReviewsResponse {
  const reviews = getAllReviews(db);
  const { from, to } = resolveRange(params);
  const propertyId = stringParam(params.property);
  const sentiment = stringParam(params.sentiment);
  const topic = stringParam(params.topic);
  const search = stringParam(params.search).toLowerCase().trim();
  const sort = stringParam(params.sort) || 'date_desc';
  const page = Math.max(1, Number.parseInt(stringParam(params.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(stringParam(params.limit), 10) || 25));

  let items = reviewsInRange(reviews, from, to, propertyId);
  if (sentiment && ['negative', 'neutral', 'positive'].includes(sentiment)) {
    items = items.filter((review) => review.sentiment === sentiment);
  }
  if (topic) items = items.filter((review) => review.topics.includes(topic));
  if (search) {
    items = items.filter((review) =>
      [review.title, review.positiveText, review.negativeText, review.reviewerName, review.roomType, review.propertyId]
        .some((value) => value.toLowerCase().includes(search)),
    );
  }

  const comparators: Record<string, (a: StoredReview, b: StoredReview) => number> = {
    date_desc: (a, b) => b.reviewDate.localeCompare(a.reviewDate),
    date_asc: (a, b) => a.reviewDate.localeCompare(b.reviewDate),
    score_desc: (a, b) => (b.score ?? 0) - (a.score ?? 0),
    score_asc: (a, b) => (a.score ?? 10) - (b.score ?? 10),
  };
  items = items.sort(comparators[sort] ?? comparators.date_desc);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items: items.slice((page - 1) * limit, page * limit),
    total,
    page: Math.min(page, totalPages),
    limit,
    totalPages,
  };
}

export function buildMeta(db: Db) {
  const freshness = getFreshness(db);
  const allReviews = getAllReviews(db);
  const earliestReviewDate = allReviews.reduce<string | null>(
    (earliest, review) => (earliest === null || review.reviewDate < earliest ? review.reviewDate : earliest),
    null,
  );
  const runs = getRecentRuns(db, 16).map((run) => ({
    propertyId: run.propertyId,
    status: run.status,
    pagesFetched: run.pagesFetched,
    reviewsFound: run.reviewsFound,
    reviewsNew: run.reviewsNew,
    error: run.error,
    finishedAt: run.finishedAt,
  }));
  return {
    properties: PROPERTIES,
    topics: TOPICS.map(({ key, label, description }) => ({ key, label, description })),
    freshness: { ...freshness, earliestReviewDate },
    recentRuns: runs,
  };
}

export function periodLengthLabel(from: string, to: string): string {
  const days = daysInclusive(from, to);
  return days === 7 ? 'this week' : `${days} days`;
}
