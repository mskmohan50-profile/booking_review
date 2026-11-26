import { runScrape, type ScrapeResult } from '../scraper/collect';
import { exportSample, getFreshness, openDatabase, reclassifyReviews, type Db } from '../scraper/store';
import type { ScrapeRunSummary, ScrapeStatusResponse } from '../shared/api';

interface RunOutcome extends ScrapeResult {
  error?: string;
}

interface TriggerOptions {
  maxPages?: number;
  source?: 'manual' | 'auto';
}

interface TriggerResult {
  accepted: boolean;
  promise?: Promise<RunOutcome>;
  error?: string;
}

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

function enabledFromEnv(): boolean {
  const value = (process.env.AUTO_REFRESH ?? '1').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(value);
}

function intervalFromEnv(): number {
  const requested = Number(process.env.AUTO_REFRESH_MS ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(requested)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(requested)));
}

function maxPagesFromEnv(name: string, fallback: number): number {
  const requested = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(requested)) return fallback;
  return Math.min(10, Math.max(1, Math.round(requested)));
}

function clamp(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(30, Math.max(1, Math.round(value)));
}

/** Owns the single collection slot and exposes its state to the dashboard. */
export class ScrapeCoordinator {
  private readonly status: ScrapeStatusResponse;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly db: Db,
  ) {
    const enabled = enabledFromEnv();
    const intervalMs = intervalFromEnv();
    this.status = {
      running: false,
      phase: 'idle',
      message: enabled ? 'Auto-check enabled' : 'Auto-check disabled',
      startedAt: null,
      finishedAt: null,
      lastRun: null,
      autoRefresh: { enabled, intervalMs, nextRunAt: null },
    };
  }

  start(): void {
    if (this.status.autoRefresh.enabled) this.schedule();
  }

  getStatus(): ScrapeStatusResponse {
    return {
      ...this.status,
      lastRun: this.status.lastRun ? { ...this.status.lastRun } : null,
      autoRefresh: { ...this.status.autoRefresh },
    };
  }

  trigger(options: TriggerOptions = {}): TriggerResult {
    if (this.status.running) {
      return { accepted: false, error: 'A collection run is already in progress.' };
    }
    return { accepted: true, promise: this.performRun(options) };
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.status.autoRefresh.enabled) return;

    const { intervalMs } = this.status.autoRefresh;
    this.timer = setInterval(() => {
      const started = this.trigger({
        maxPages: maxPagesFromEnv('AUTO_REFRESH_MAX_PAGES', 3),
        source: 'auto',
      });
      if (started.promise) void started.promise;
    }, intervalMs);
    this.timer.unref?.();
    this.status.autoRefresh.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  }

  private async performRun(options: TriggerOptions): Promise<RunOutcome> {
    const source = options.source ?? 'manual';
    const startedAt = new Date().toISOString();
    this.status.running = true;
    this.status.phase = 'running';
    this.status.startedAt = startedAt;
    this.status.finishedAt = null;
    this.status.message = source === 'auto' ? 'Automatic check starting…' : 'Starting collection…';

    try {
      const result = await runScrape({
        dbPath: this.dbPath,
        maxPages: clamp(options.maxPages, 10),
        delayMs: 700,
        onProgress: (message) => {
          const short = message.length > 150 ? `${message.slice(0, 147)}…` : message;
          this.status.message = short;
          console.log(`[scrape:${source}] ${message}`);
        },
      });

      reclassifyReviews(this.db);
      const freshDb = openDatabase(this.dbPath);
      exportSample(freshDb);
      freshDb.close();

      const failed = result.runs.find((run) => run.status === 'failed');
      const error = result.ok ? null : failed?.error ?? 'One or more properties could not be refreshed.';
      const finishedAt = new Date().toISOString();
      const lastRun: ScrapeRunSummary = {
        ok: result.ok,
        reviewsNew: result.reviewsNew,
        reviewsFound: result.reviewsFound,
        totalReviews: result.totalReviews,
        finishedAt,
        error,
        source,
      };

      this.status.running = false;
      this.status.phase = result.ok ? 'ok' : 'error';
      this.status.finishedAt = finishedAt;
      this.status.lastRun = lastRun;
      this.status.message = result.ok
        ? result.reviewsNew > 0
          ? `Added ${result.reviewsNew} new review${result.reviewsNew === 1 ? '' : 's'}`
          : 'No new reviews found'
        : 'Collection finished with errors';

      return { ...result, error: error ?? undefined };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const finishedAt = new Date().toISOString();
      const freshness = getFreshness(this.db);
      const lastRun: ScrapeRunSummary = {
        ok: false,
        reviewsNew: 0,
        reviewsFound: 0,
        totalReviews: freshness.totalReviews,
        finishedAt,
        error: message,
        source,
      };

      this.status.running = false;
      this.status.phase = 'error';
      this.status.finishedAt = finishedAt;
      this.status.lastRun = lastRun;
      this.status.message = 'Collection failed';
      console.error(`[scrape:${source}]`, cause);

      return {
        runs: [],
        reviewsFound: 0,
        reviewsNew: 0,
        totalReviews: freshness.totalReviews,
        lastScrapedAt: freshness.lastScrapedAt,
        ok: false,
        error: message,
      };
    } finally {
      this.schedule();
    }
  }
}
