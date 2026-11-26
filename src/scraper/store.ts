import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROPERTIES } from '../shared/properties';
import { classifyReview } from '../shared/topics';
import type { CollectionRun, PropertySnapshot, StoredReview } from '../shared/types';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_DB_PATH = resolve(projectRoot, 'data/reviews.db');
export const DEFAULT_EXPORT_PATH = resolve(projectRoot, 'data/sample-reviews.json');

export type Db = Database.Database;

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      accent TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      raw_date TEXT NOT NULL DEFAULT '',
      reviewer_name TEXT NOT NULL DEFAULT '',
      reviewer_country TEXT NOT NULL DEFAULT '',
      review_date TEXT NOT NULL,
      score REAL,
      title TEXT NOT NULL DEFAULT '',
      positive_text TEXT NOT NULL DEFAULT '',
      negative_text TEXT NOT NULL DEFAULT '',
      room_type TEXT NOT NULL DEFAULT '',
      nights INTEGER,
      stay_date TEXT NOT NULL DEFAULT '',
      traveler_type TEXT NOT NULL DEFAULT '',
      has_property_reply INTEGER NOT NULL DEFAULT 0,
      source_url TEXT NOT NULL DEFAULT '',
      scraped_at TEXT NOT NULL,
      sentiment TEXT NOT NULL DEFAULT 'neutral',
      topics TEXT NOT NULL DEFAULT '[]',
      negative_topics TEXT NOT NULL DEFAULT '[]',
      positive_topics TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_property_date ON reviews(property_id, review_date DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(review_date DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_score ON reviews(score);
    CREATE TABLE IF NOT EXISTS collection_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      status TEXT NOT NULL,
      pages_fetched INTEGER NOT NULL DEFAULT 0,
      reviews_found INTEGER NOT NULL DEFAULT 0,
      reviews_new INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS property_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      overall_score REAL,
      review_count INTEGER,
      subscores TEXT NOT NULL DEFAULT '[]',
      captured_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_property_time ON property_snapshots(property_id, captured_at DESC);
  `);

  // Schema migration for databases created before raw_date was introduced.
  const columns = db.prepare('PRAGMA table_info(reviews)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'raw_date')) {
    db.exec("ALTER TABLE reviews ADD COLUMN raw_date TEXT NOT NULL DEFAULT ''");
  }

  const seed = db.prepare('INSERT OR IGNORE INTO properties (id, name, url, accent) VALUES (?, ?, ?, ?)');
  const seedAll = db.transaction(() => {
    for (const property of PROPERTIES) {
      seed.run(property.id, property.name, property.url, property.accent);
    }
  });
  seedAll();
  return db;
}

interface ReviewRow {
  id: string;
  property_id: string;
  raw_date: string;
  reviewer_name: string;
  reviewer_country: string;
  review_date: string;
  score: number | null;
  title: string;
  positive_text: string;
  negative_text: string;
  room_type: string;
  nights: number | null;
  stay_date: string;
  traveler_type: string;
  has_property_reply: number;
  source_url: string;
  scraped_at: string;
  sentiment: StoredReview['sentiment'];
  topics: string;
  negative_topics: string;
  positive_topics: string;
}

function rowToReview(row: ReviewRow): StoredReview {
  return {
    id: row.id,
    propertyId: row.property_id,
    reviewerName: row.reviewer_name,
    reviewerCountry: row.reviewer_country,
    rawDate: row.raw_date || row.review_date,
    reviewDate: row.review_date,
    score: row.score,
    title: row.title,
    positiveText: row.positive_text,
    negativeText: row.negative_text,
    roomType: row.room_type,
    nights: row.nights,
    stayDate: row.stay_date,
    travelerType: row.traveler_type,
    hasPropertyReply: Boolean(row.has_property_reply),
    sourceUrl: row.source_url,
    scrapedAt: row.scraped_at,
    sentiment: row.sentiment,
    topics: JSON.parse(row.topics) as string[],
    negativeTopics: JSON.parse(row.negative_topics) as string[],
    positiveTopics: JSON.parse(row.positive_topics) as string[],
  };
}

const INSERT_REVIEW = `
  INSERT OR IGNORE INTO reviews (
    id, property_id, raw_date, reviewer_name, reviewer_country, review_date, score, title,
    positive_text, negative_text, room_type, nights, stay_date, traveler_type,
    has_property_reply, source_url, scraped_at, sentiment, topics,
    negative_topics, positive_topics
  ) VALUES (
    @id, @propertyId, @rawDate, @reviewerName, @reviewerCountry, @reviewDate, @score, @title,
    @positiveText, @negativeText, @roomType, @nights, @stayDate, @travelerType,
    @hasPropertyReply, @sourceUrl, @scrapedAt, @sentiment, @topics,
    @negativeTopics, @positiveTopics
  )
`;

export function saveReviews(db: Db, reviews: StoredReview[]): { inserted: number; skipped: number } {
  const statement = db.prepare(INSERT_REVIEW);
  const insertAll = db.transaction((batch: StoredReview[]) => {
    let inserted = 0;
    for (const review of batch) {
      inserted += statement.run({
        id: review.id,
        propertyId: review.propertyId,
        rawDate: review.rawDate,
        reviewerName: review.reviewerName,
        reviewerCountry: review.reviewerCountry,
        reviewDate: review.reviewDate,
        score: review.score,
        title: review.title,
        positiveText: review.positiveText,
        negativeText: review.negativeText,
        roomType: review.roomType,
        nights: review.nights,
        stayDate: review.stayDate,
        travelerType: review.travelerType,
        hasPropertyReply: review.hasPropertyReply ? 1 : 0,
        sourceUrl: review.sourceUrl,
        scrapedAt: review.scrapedAt,
        sentiment: review.sentiment,
        topics: JSON.stringify(review.topics),
        negativeTopics: JSON.stringify(review.negativeTopics),
        positiveTopics: JSON.stringify(review.positiveTopics),
      }).changes;
    }
    return { inserted, skipped: batch.length - inserted };
  });
  return insertAll(reviews);
}

export function getAllReviews(db: Db): StoredReview[] {
  const rows = db.prepare('SELECT * FROM reviews').all() as ReviewRow[];
  return rows.map(rowToReview);
}

/**
 * Re-apply the current topic rules to stored reviews. Called on startup so that
 * improving a keyword rule also updates historical data without a rescrape.
 */
export function reclassifyReviews(db: Db): number {
  const reviews = getAllReviews(db);
  const update = db.prepare(`
    UPDATE reviews SET sentiment = ?, topics = ?, negative_topics = ?, positive_topics = ? WHERE id = ?
  `);
  const updateAll = db.transaction(() => {
    for (const review of reviews) {
      const classification = classifyReview({
        score: review.score ?? 0,
        title: review.title,
        positiveText: review.positiveText,
        negativeText: review.negativeText,
      });
      update.run(
        classification.sentiment,
        JSON.stringify(classification.topics),
        JSON.stringify(classification.negativeTopics),
        JSON.stringify(classification.positiveTopics),
        review.id,
      );
    }
  });
  updateAll();
  return reviews.length;
}

export function saveRun(db: Db, run: CollectionRun): void {
  db.prepare(`
    INSERT INTO collection_runs
      (property_id, status, pages_fetched, reviews_found, reviews_new, error, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.propertyId, run.status, run.pagesFetched, run.reviewsFound, run.reviewsNew,
    run.error, run.startedAt, run.finishedAt,
  );
}

export interface RunRow extends CollectionRun {
  id: number;
}

export function getRecentRuns(db: Db, limit = 20): RunRow[] {
  const rows = db.prepare('SELECT * FROM collection_runs ORDER BY id DESC LIMIT ?').all(limit) as Array<{
    id: number;
    property_id: string;
    status: string;
    pages_fetched: number;
    reviews_found: number;
    reviews_new: number;
    error: string | null;
    started_at: string;
    finished_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    status: row.status as CollectionRun['status'],
    pagesFetched: row.pages_fetched,
    reviewsFound: row.reviews_found,
    reviewsNew: row.reviews_new,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export function saveSnapshot(db: Db, snapshot: PropertySnapshot): void {
  db.prepare(`
    INSERT INTO property_snapshots (property_id, overall_score, review_count, subscores, captured_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    snapshot.propertyId,
    snapshot.overallScore,
    snapshot.reviewCount,
    JSON.stringify(snapshot.subscores),
    snapshot.capturedAt,
  );
}

export function getLatestSnapshots(db: Db): PropertySnapshot[] {
  const rows = db.prepare(`
    SELECT ps.* FROM property_snapshots ps
    JOIN (SELECT property_id, MAX(id) AS max_id FROM property_snapshots GROUP BY property_id) latest
      ON latest.max_id = ps.id
  `).all() as Array<{
    property_id: string;
    overall_score: number | null;
    review_count: number | null;
    subscores: string;
    captured_at: string;
  }>;
  return rows.map((row) => ({
    propertyId: row.property_id,
    overallScore: row.overall_score,
    reviewCount: row.review_count,
    subscores: JSON.parse(row.subscores) as PropertySnapshot['subscores'],
    capturedAt: row.captured_at,
  }));
}

export function getFreshness(db: Db): { lastScrapedAt: string | null; totalReviews: number } {
  const row = db.prepare('SELECT MAX(scraped_at) AS lastScrapedAt, COUNT(*) AS totalReviews FROM reviews').get() as {
    lastScrapedAt: string | null;
    totalReviews: number;
  };
  return { lastScrapedAt: row.lastScrapedAt, totalReviews: row.totalReviews };
}

/** Write a portable sample of the collected data (no raw HTML or credentials). */
export function exportSample(db: Db, exportPath: string = DEFAULT_EXPORT_PATH): number {
  const reviews = getAllReviews(db).sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'Public Booking.com guest review pages',
    properties: PROPERTIES,
    reviewCount: reviews.length,
    reviews,
  };
  mkdirSync(dirname(exportPath), { recursive: true });
  writeFileSync(exportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return reviews.length;
}
