import { DEFAULT_DB_PATH, getFreshness, openDatabase, saveReviews, saveRun, saveSnapshot, type Db } from './store';
import {
  assertNotChallenged,
  getLastPageNumber,
  openReviewsTab,
  openSession,
  sleep,
  goToNextPage,
  type SessionOptions,
} from './browser';
import { extractPropertySummaryFromDom, extractReviewCardsFromDom } from './dom.js';
import { toStoredReview } from './parse';
import { PROPERTIES, propertyById } from '../shared/properties';
import { isDateString, toSydneyDate } from '../shared/dates';
import type { CollectionRun, StoredReview } from '../shared/types';

export interface ScrapeOptions extends SessionOptions {
  dbPath?: string;
  maxPages?: number;
  delayMs?: number;
  propertyIds?: string[];
  since?: string;
  full?: boolean;
  onProgress?: (message: string) => void;
}

export interface ScrapeResult {
  runs: CollectionRun[];
  reviewsFound: number;
  reviewsNew: number;
  totalReviews: number;
  lastScrapedAt: string | null;
  ok: boolean;
}

async function collectProperty(
  db: Db,
  page: import('playwright').Page,
  propertyId: string,
  options: ScrapeOptions,
): Promise<{ run: CollectionRun; stored: StoredReview[] }> {
  const property = propertyById(propertyId);
  if (!property) throw new Error(`Unknown property: ${propertyId}`);

  const startedAt = new Date().toISOString();
  const run: CollectionRun = {
    propertyId,
    status: 'ok',
    pagesFetched: 0,
    reviewsFound: 0,
    reviewsNew: 0,
    error: null,
    startedAt,
    finishedAt: startedAt,
  };
  const stored: StoredReview[] = [];

  try {
    const log = options.onProgress ?? (() => undefined);
    log(`Opening ${property.name}…`);
    await openReviewsTab(page, property.url);
    await assertNotChallenged(page);

    const summary = await page.evaluate(extractPropertySummaryFromDom);
    saveSnapshot(db, {
      propertyId,
      overallScore: summary.overallScore,
      reviewCount: summary.reviewCount,
      subscores: summary.subscores,
      capturedAt: new Date().toISOString(),
    });

    const availablePages = await getLastPageNumber(page);
    const maxPages = Math.max(1, options.maxPages ?? 30);
    const pageLimit = Math.min(availablePages, maxPages);
    const seenIds = new Set<string>();
    log(`  ${summary.reviewCount ?? '?'} reviews on Booking.com — reading ${pageLimit} of ${availablePages} pages`);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (pageNumber > 1) await goToNextPage(page, pageNumber);
      await assertNotChallenged(page);

      const rawCards = await page.evaluate(extractReviewCardsFromDom);
      const scrapedAt = new Date().toISOString();
      const storedCards = rawCards
        .map((raw) => toStoredReview(raw, propertyId, property.url, scrapedAt))
        .filter((review): review is StoredReview => review !== null);

      if (storedCards.length === 0) throw new Error(`No parseable reviews found on page ${pageNumber}.`);

      const newOnPage = storedCards.filter((review) => !seenIds.has(review.id));
      const saved = saveReviews(db, storedCards);
      for (const review of storedCards) seenIds.add(review.id);

      run.pagesFetched += 1;
      run.reviewsFound += storedCards.length;
      run.reviewsNew += saved.inserted;
      stored.push(...newOnPage);
      log(`  page ${pageNumber}/${pageLimit}: ${storedCards.length} reviews, ${saved.inserted} new`);

      const oldestDate = storedCards.reduce(
        (oldest, review) => (review.reviewDate < oldest ? review.reviewDate : oldest),
        storedCards[0].reviewDate,
      );
      if (options.since && isDateString(options.since) && oldestDate < options.since) {
        log(`  reached reviews older than ${options.since}; stopping early`);
        break;
      }
      if (!options.full && pageNumber > 1 && newOnPage.length === 0) {
        log('  no new reviews on this page; stopping incremental scan');
        break;
      }

      if (pageNumber < pageLimit) {
        const delay = Math.max(0, options.delayMs ?? 900);
        await sleep(delay + Math.round(Math.random() * 250));
      }
    }
  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);
  } finally {
    run.finishedAt = new Date().toISOString();
  }

  return { run, stored };
}

export async function runScrape(options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const db = openDatabase(options.dbPath ?? DEFAULT_DB_PATH);
  const requestedIds = options.propertyIds?.length ? options.propertyIds : PROPERTIES.map((property) => property.id);
  const properties = requestedIds.map(propertyById).filter((property): property is NonNullable<typeof property> => Boolean(property));

  const session = await openSession({ headed: options.headed, profileDir: options.profileDir, channel: options.channel });
  const runs: CollectionRun[] = [];
  let reviewsFound = 0;
  let reviewsNew = 0;

  try {
    for (const property of properties) {
      const { run } = await collectProperty(db, session.page, property.id, options);
      runs.push(run);
      reviewsFound += run.reviewsFound;
      reviewsNew += run.reviewsNew;
      saveRun(db, run);
      const log = options.onProgress ?? (() => undefined);
      log(run.status === 'ok' ? `Finished ${property.name}: ${run.reviewsNew} new` : `Failed ${property.name}: ${run.error}`);
    }
  } finally {
    await session.close();
    db.close();
  }

  const freshDb = openDatabase(options.dbPath ?? DEFAULT_DB_PATH);
  const freshness = getFreshness(freshDb);
  freshDb.close();

  return {
    runs,
    reviewsFound,
    reviewsNew,
    totalReviews: freshness.totalReviews,
    lastScrapedAt: freshness.lastScrapedAt,
    ok: runs.some((run) => run.status === 'ok'),
  };
}
