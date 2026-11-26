import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewDate, previousRange, startOfWeek, daysInclusive } from '../src/shared/dates';
import { classifyReview, sentimentForScore } from '../src/shared/topics';
import { reviewFingerprint } from '../src/scraper/parse';
import type { RawReview } from '../src/shared/types';

test('ISO weeks start on Monday', () => {
  assert.equal(startOfWeek('2026-11-26'), '2026-11-23');
  assert.equal(startOfWeek('2026-11-22'), '2026-11-16');
  assert.equal(startOfWeek('2026-11-23'), '2026-11-23');
});

test('previous range has the same number of days and ends before the current range', () => {
  const previous = previousRange('2026-11-23', '2026-11-27');
  assert.equal(previous.from, '2026-11-18');
  assert.equal(previous.toExclusive, '2026-11-23');
  assert.equal(daysInclusive(previous.from, '2026-11-22'), daysInclusive('2026-11-23', '2026-11-27'));
});

test('Booking.com review dates are parsed', () => {
  assert.equal(parseReviewDate('Reviewed: November 25, 2026'), '2026-11-25');
  assert.equal(parseReviewDate('Reviewed: January 3, 2025'), '2025-01-03');
  assert.equal(parseReviewDate('No date here'), null);
});

test('sentiment bands match the documented thresholds', () => {
  assert.equal(sentimentForScore(4), 'negative');
  assert.equal(sentimentForScore(6), 'negative');
  assert.equal(sentimentForScore(7), 'neutral');
  assert.equal(sentimentForScore(8), 'positive');
});

test('issues are classified from the negative field only', () => {
  const result = classifyReview({
    score: 5,
    title: 'Not great',
    positiveText: 'Friendly staff and a great location.',
    negativeText: 'The bathroom was dirty and the aircon was very loud.',
  });
  assert.ok(result.negativeTopics.includes('cleanliness'));
  assert.ok(result.negativeTopics.includes('noise'));
  assert.ok(!result.negativeTopics.includes('staff'));
  assert.ok(result.positiveTopics.includes('staff'));
  assert.ok(result.positiveTopics.includes('location'));
});

test('fingerprint is stable for text edits but unique per property', () => {
  const base: RawReview = {
    reviewerName: 'Alex',
    reviewerCountry: 'Australia',
    rawDate: 'Reviewed: November 25, 2026',
    reviewDate: '2026-11-25',
    title: 'Good stay',
    score: 7,
    positiveText: 'Clean room',
    negativeText: '',
    roomType: 'Double Room',
    nights: 2,
    stayDate: 'November 2026',
    travelerType: 'Couple',
    hasPropertyReply: false,
  };
  const first = reviewFingerprint('olympic-paddington', base);
  assert.equal(first, reviewFingerprint('olympic-paddington', { ...base, positiveText: 'Very clean room' }));
  assert.notEqual(first, reviewFingerprint('potts-point', base));
});
