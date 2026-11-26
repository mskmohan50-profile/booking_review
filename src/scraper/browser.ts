import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_PROFILE_DIR = resolve(projectRoot, 'data/browser-profile');

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SessionOptions {
  headed?: boolean;
  profileDir?: string;
  channel?: string;
  locale?: string;
  userAgent?: string;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function openSession(options: SessionOptions = {}): Promise<Session> {
  const userDataDir = options.profileDir ?? DEFAULT_PROFILE_DIR;
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: options.channel ?? process.env.BROWSER_CHANNEL ?? 'chrome',
    headless: options.headed ? false : process.env.HEADED !== '1',
    locale: options.locale ?? 'en-US',
    timezoneId: 'Australia/Sydney',
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(20_000);
  return { context, page, close: () => context.close() };
}

export class ChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChallengeError';
  }
}
export async function waitForBookingPage(page: Page, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      challenge: Boolean(document.querySelector('#challenge-container')),
      ready: Boolean(document.querySelector('[data-testid="fr-read-all-reviews"]')),
    })).catch(() => ({ challenge: false, ready: false }));
    if (state.ready) return;
    await page.waitForTimeout(1_200);
  }
  throw new ChallengeError('Timed out waiting for Booking.com to render the hotel page (WAF challenge or slow response).');
}
export function reviewsUrlFor(propertyUrl: string): string {
  const url = new URL(propertyUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  return `${url.origin}/reviews/${parts[1]}/hotel/${parts[2]}?lang=en-us&sort=review_date_desc`;
}

export async function openReviewsTab(page: Page, propertyUrl: string): Promise<void> {
  await page.goto(reviewsUrlFor(propertyUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForBookingPage(page);

  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
    const triggers = [
      '[data-testid="review-score-read-all-actionable"]',
      '[data-testid="fr-read-all-reviews"]',
      '[data-testid="Property-Header-Nav-Tab-Trigger-reviews"]',
    ];
    for (const selector of triggers) {
      const trigger = page.locator(selector).first();
      if ((await trigger.count()) === 0) continue;
      try {
        await trigger.click({ timeout: 8_000 });
        await page.locator('[data-testid="review-card"]').first().waitFor({ state: 'attached', timeout: 20_000 });
        opened = true;
        break;
      } catch {
      }
    }
    if (!opened) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForBookingPage(page);
    }
  }
  if (!opened) throw new ChallengeError('Could not open the guest reviews tab.');

  const showAll = page.getByRole('button', { name: /show all reviews/i });
  if (await showAll.count()) {
    await showAll.first().click({ timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  const sorter = page.locator('[data-testid="reviews-sorter-component"]');
  if (await sorter.count()) {
    await sorter.selectOption('NEWEST_FIRST');
    await page.waitForTimeout(1_200);
  }
}

export async function getLastPageNumber(page: Page): Promise<number> {
  return page.locator('button[aria-label^="Page "]').evaluateAll((buttons) =>
    buttons.reduce((max, button) => {
      const match = button.getAttribute('aria-label')?.match(/^Page (\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 1),
  );
}

export async function getShowingText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/Showing\s+\d+\s*-\s*\d+/i);
    return match?.[0] ?? '';
  });
}

export async function assertNotChallenged(page: Page): Promise<void> {
  const challenged = await page.evaluate(() => Boolean(document.querySelector('#challenge-container')));
  if (challenged) throw new ChallengeError('Booking.com presented a challenge while reviews were being collected.');
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function goToNextPage(page: Page, nextPageNumber: number): Promise<void> {
  const before = await Promise.all([
    getShowingText(page),
    page.locator('[data-testid="review-card"]').first().innerText().catch(() => ''),
  ]);

  const named = page.locator(`button[aria-label="Page ${nextPageNumber}"]`);
  const button = (await named.count()) ? named : page.locator('button[aria-label="Next page"]');
  if ((await button.count()) === 0) throw new Error(`No pagination control for page ${nextPageNumber}.`);

  await button.first().click({ timeout: 12_000 });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await assertNotChallenged(page);
    const after = await Promise.all([
      getShowingText(page),
      page.locator('[data-testid="review-card"]').first().innerText().catch(() => ''),
    ]);

    if (after[1] && after[1] !== before[1]) return;
    if (!before[1] && after[0] !== before[0]) return;
    await page.waitForTimeout(350);
  }
  throw new Error(`Page ${nextPageNumber} did not load in time.`);
}
