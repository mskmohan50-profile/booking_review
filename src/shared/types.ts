import type { Sentiment } from './topics';

export interface RawReview {
  reviewerName: string;
  reviewerCountry: string;
  rawDate: string;
  reviewDate: string | null;
  title: string;
  score: number | null;
  positiveText: string;
  negativeText: string;
  roomType: string;
  nights: number | null;
  stayDate: string;
  travelerType: string;
  hasPropertyReply: boolean;
}

export interface StoredReview extends Omit<RawReview, 'reviewDate'> {
  /** Validated during ingest; stored reviews always have a parsed date. */
  reviewDate: string;
  id: string;
  propertyId: string;
  sourceUrl: string;
  scrapedAt: string;
  sentiment: Sentiment;
  topics: string[];
  negativeTopics: string[];
  positiveTopics: string[];
}

export interface PropertySnapshot {
  propertyId: string;
  overallScore: number | null;
  reviewCount: number | null;
  subscores: { label: string; score: number }[];
  capturedAt: string;
}

export interface CollectionRun {
  propertyId: string;
  status: 'ok' | 'partial' | 'failed';
  pagesFetched: number;
  reviewsFound: number;
  reviewsNew: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface DateWindow {
  from: string;
  to: string;
  label: string;
}
