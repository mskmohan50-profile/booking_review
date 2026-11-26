import type { PropertySnapshot, StoredReview } from './types';

export interface PeriodStats {
  from: string;
  to: string;
  label: string;
  reviewCount: number;
  averageScore: number | null;
  negativeCount: number;
  negativePct: number | null;
  positiveCount: number;
  positivePct: number | null;
}

export interface PropertyBreakdown extends PeriodStats {
  propertyId: string;
  name: string;
  shortName: string;
  accent: string;
  previousAverage: number | null;
  delta: number | null;
  latestSubscores: PropertySnapshot['subscores'];
}

export interface WeeklyPoint {
  weekStart: string;
  label: string;
  averageScore: number | null;
  reviewCount: number;
}

export interface SentimentPoint {
  weekStart: string;
  label: string;
  negativePct: number | null;
  reviewCount: number;
}

export interface SummaryResponse {
  generatedAt: string;
  range: { from: string; to: string };
  thisWeek: PeriodStats;
  lastWeek: PeriodStats;
  current: PeriodStats;
  previous: PeriodStats;
  propertyBreakdown: PropertyBreakdown[];
  weeklyTrend: WeeklyPoint[];
  sentimentTrend: SentimentPoint[];
  ratingDistribution: { label: string; count: number }[];
  freshness: { lastScrapedAt: string | null; totalReviews: number };
  snapshots: PropertySnapshot[];
}

export interface TopicInsight {
  key: string;
  label: string;
  description: string;
  count: number;
  pct: number | null;
  previousPct: number | null;
  deltaPp: number | null;
  exampleQuote: string | null;
}

export interface PropertyIssue {
  propertyId: string;
  name: string;
  topicKey: string | null;
  topicLabel: string | null;
  negativeCount: number;
  topCount: number;
}

export interface InsightsResponse {
  range: { from: string; to: string };
  negativeCount: number;
  negativePct: number | null;
  positiveCount: number;
  negativeTopics: TopicInsight[];
  positiveTopics: TopicInsight[];
  spotlight: string;
  perProperty: PropertyIssue[];
}

export interface ReviewsResponse {
  items: StoredReview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MetaResponse {
  properties: { id: string; name: string; shortName: string; url: string; accent: string }[];
  topics: { key: string; label: string; description: string }[];
  freshness: { lastScrapedAt: string | null; totalReviews: number; earliestReviewDate: string | null };
  recentRuns: {
    propertyId: string;
    status: string;
    pagesFetched: number;
    reviewsFound: number;
    reviewsNew: number;
    error: string | null;
    finishedAt: string;
  }[];
}

export interface ScrapeRunSummary {
  ok: boolean;
  reviewsNew: number;
  reviewsFound: number;
  totalReviews: number;
  finishedAt: string;
  error: string | null;
  source: 'manual' | 'auto';
}

export interface ScrapeStatusResponse {
  running: boolean;
  phase: 'idle' | 'running' | 'ok' | 'error';
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastRun: ScrapeRunSummary | null;
  autoRefresh: {
    enabled: boolean;
    intervalMs: number;
    nextRunAt: string | null;
  };
}
