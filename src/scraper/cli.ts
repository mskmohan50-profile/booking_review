import { runScrape } from './collect';
import { DEFAULT_DB_PATH, DEFAULT_EXPORT_PATH, exportSample, openDatabase, reclassifyReviews } from './store';
import { isDateString, toSydneyDate } from '../shared/dates';
import { PROPERTIES } from '../shared/properties';

interface Args {
  maxPages: number;
  delayMs: number;
  propertyIds: string[];
  since?: string;
  full: boolean;
  headed: boolean;
  dbPath: string;
  exportPath: string;
  skipExport: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxPages: Number(process.env.SCRAPE_MAX_PAGES ?? 30),
    delayMs: Number(process.env.SCRAPE_DELAY_MS ?? 900),
    propertyIds: [],
    full: false,
    headed: false,
    dbPath: process.env.DATABASE_PATH ?? DEFAULT_DB_PATH,
    exportPath: process.env.EXPORT_PATH ?? DEFAULT_EXPORT_PATH,
    skipExport: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] ?? '';
    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--max-pages':
        args.maxPages = Number(next());
        break;
      case '--delay':
        args.delayMs = Number(next());
        break;
      case '--property':
        args.propertyIds.push(next());
        break;
      case '--since':
        args.since = next();
        break;
      case '--full':
        args.full = true;
        break;
      case '--headed':
        args.headed = true;
        break;
      case '--db':
        args.dbPath = next();
        break;
      case '--export':
        args.exportPath = next();
        break;
      case '--no-export':
        args.skipExport = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  if (!Number.isFinite(args.maxPages) || args.maxPages < 1) throw new Error('--max-pages must be a positive number.');
  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) throw new Error('--delay must be zero or greater.');
  if (args.since && !isDateString(args.since)) throw new Error('--since must be YYYY-MM-DD.');
  const knownIds = new Set(PROPERTIES.map((property) => property.id));
  for (const id of args.propertyIds) {
    if (!knownIds.has(id)) throw new Error(`Unknown property "${id}". Choose from: ${[...knownIds].join(', ')}`);
  }
  return args;
}

function printHelp(): void {
  console.log(`
Azzurro Hotels — Booking.com review collector

Usage:
  npm run scrape -- [options]

Options:
  --max-pages N   Maximum review pages per property (10 reviews per page). Default: 30
  --delay N       Minimum pause between pages in ms. Default: 900 (plus small jitter)
  --property ID   Only scrape one property. Repeat for several. Default: all four
  --since DATE    Stop a property when it reaches reviews older than DATE (YYYY-MM-DD)
  --full          Force a full scan instead of stopping after a page with no new reviews
  --headed        Show the browser window (useful if Booking.com asks for interaction)
  --db PATH       SQLite database path
  --export PATH   JSON sample export path
  --no-export     Skip the JSON sample export
  -h, --help      Show this help

Properties: ${PROPERTIES.map((property) => property.id).join(', ')}
`);
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }

  console.log(`Review collection started (Sydney date: ${toSydneyDate()}).`);
  const result = await runScrape({
    dbPath: args.dbPath,
    maxPages: args.maxPages,
    delayMs: args.delayMs,
    propertyIds: args.propertyIds,
    since: args.since,
    full: args.full,
    headed: args.headed,
    onProgress: (message) => console.log(message),
  });

  console.log('\nRun summary');
  console.table(result.runs.map((run) => ({
    property: run.propertyId,
    status: run.status,
    pages: run.pagesFetched,
    found: run.reviewsFound,
    new: run.reviewsNew,
    error: run.error ?? '',
  })));

  if (!args.skipExport) {
    const db = openDatabase(args.dbPath);
    reclassifyReviews(db);
    const count = exportSample(db, args.exportPath);
    db.close();
    console.log(`Exported ${count} reviews to ${args.exportPath}`);
  }
  console.log(`Dataset now contains ${result.totalReviews} reviews.`);
  if (!result.ok) {
    console.error('All properties failed. Check network access and try --headed.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
