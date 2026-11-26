import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, openDatabase, reclassifyReviews } from '../scraper/store';
import { buildInsights, buildMeta, buildSummary, queryReviews } from './analytics';
import { ScrapeCoordinator } from './scrapeCoordinator';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;
const db = openDatabase(dbPath);
reclassifyReviews(db);
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'azzurro-review-insights' });
});

app.get('/api/meta', (_request, response) => {
  response.json(buildMeta(db));
});

app.get('/api/summary', (request, response) => {
  response.json(buildSummary(db, request.query));
});

app.get('/api/insights', (request, response) => {
  response.json(buildInsights(db, request.query));
});

app.get('/api/reviews', (request, response) => {
  response.json(queryReviews(db, request.query));
});

const coordinator = new ScrapeCoordinator(dbPath, db);
coordinator.start();

app.get('/api/status', (_request, response) => {
  response.json(coordinator.getStatus());
});

app.post('/api/scrape', async (request, response) => {
  if (process.env.ENABLE_SCRAPE_TRIGGER === '0') {
    response.status(403).json({ error: 'Scrape trigger is disabled on this deployment.' });
    return;
  }
  const requestedPages = Number(request.body?.maxPages ?? process.env.SCRAPE_MAX_PAGES ?? 10);
  const maxPages = Math.min(30, Math.max(1, Number.isFinite(requestedPages) ? requestedPages : 10));
  const started = coordinator.trigger({ maxPages, source: 'manual' });
  if (!started.accepted) {
    response.status(409).json({ error: started.error });
    return;
  }
  try {
    const result = await started.promise!;
    response.json({
      ok: result.ok,
      reviewsNew: result.reviewsNew,
      reviewsFound: result.reviewsFound,
      totalReviews: result.totalReviews,
      runs: result.runs,
      error: result.error ?? null,
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const distPath = resolve(projectRoot, 'web/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api')) {
      response.sendFile(resolve(distPath, 'index.html'));
      return;
    }
    next();
  });
} else {
  app.get('/', (_request, response) => {
    response.type('html').send(
      '<h1>Azzurro Review Insights API</h1><p>The frontend is not built yet. Run <code>npm run build</code> or <code>npm run dev</code>.</p>',
    );
  });
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Azzurro Review Insights API listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});
