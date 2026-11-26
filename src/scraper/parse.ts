import { createHash } from 'node:crypto';
import { parseReviewDate } from '../shared/dates';
import { classifyReview } from '../shared/topics';
import type { RawReview, StoredReview } from '../shared/types';

export function reviewFingerprint(propertyId: string, raw: RawReview): string {
  const parts = [
    propertyId,
    (raw.reviewerName || '').toLowerCase().trim(),
    raw.reviewDate ?? '',
    String(raw.score ?? ''),
    (raw.title || '').toLowerCase().trim(),
    (raw.roomType || '').toLowerCase().trim(),
  ];
  return createHash('sha256').update(parts.join('\u0001')).digest('hex');
}

export function toStoredReview(raw: RawReview, propertyId: string, sourceUrl: string, scrapedAt: string): StoredReview | null {
  const reviewDate = parseReviewDate(raw.rawDate);
  if (!reviewDate || raw.score === null || Number.isNaN(raw.score)) return null;
  const classification = classifyReview({
    score: raw.score,
    title: raw.title,
    positiveText: raw.positiveText,
    negativeText: raw.negativeText,
  });
  return {
    ...raw,
    id: reviewFingerprint(propertyId, raw),
    reviewDate,
    propertyId,
    sourceUrl,
    scrapedAt,
    sentiment: classification.sentiment,
    topics: classification.topics,
    negativeTopics: classification.negativeTopics,
    positiveTopics: classification.positiveTopics,
  };
}
