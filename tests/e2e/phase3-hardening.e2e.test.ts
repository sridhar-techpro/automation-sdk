/**
 * Phase 3 Hardening — Additional E2E coverage for the goal-execution pipeline.
 *
 * Covers four new scenarios without touching existing tests:
 *  1. Partial failure  — Amazon aborted, Flipkart returns results
 *  2. Ordering         — rating DESC, then price ASC on tie
 *  3. Non-ecommerce    — LOGIN intent does not throw and returns structured result
 *  4. Performance      — executeGoal completes within a reasonable time
 *
 * Design constraints (same as goal.e2e.test.ts):
 *  - Never call browser.newPage() while the SDK is connected.
 *  - Never call page.bringToFront() in headless Chrome.
 *  - Use Puppeteer request interception to serve deterministic mock HTML.
 *  - Always check hostname via new URL(...).hostname (CodeQL-safe).
 *  - Let browser.close() in afterAll handle cleanup.
 *  - A warmup intercepted navigation in beforeAll primes Chrome's request-
 *    interception state so that the first abort-based test does not run on a
 *    cold browser (which can reset interception state unexpectedly).
 */
import * as puppeteer from 'puppeteer-core';
import type { Browser, HTTPRequest } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// ─── Mock HTML fixtures ───────────────────────────────────────────────────────

/**
 * Standard four-product mock page (same product set as goal.e2e.test.ts).
 * Products that pass "under 30000, rating > 4":
 *   Samsung Galaxy S23 — 28000 / 4.5 ✓
 *   Pixel 8a           — 25000 / 4.3 ✓
 * Products that do NOT pass:
 *   OnePlus 12         — 32000 / 4.6  (price > 30000)
 *   Redmi Note 13      — 18000 / 3.8  (rating ≤ 4)
 */
const MOCK_PRODUCT_HTML = `<!DOCTYPE html>
<html>
<head><title>Search Results</title></head>
<body>
<article class="product-item">
  <span class="product-title">Samsung Galaxy S23</span>
  <span class="product-price">28000</span>
  <span class="product-rating">4.5</span>
</article>
<article class="product-item">
  <span class="product-title">OnePlus 12</span>
  <span class="product-price">32000</span>
  <span class="product-rating">4.6</span>
</article>
<article class="product-item">
  <span class="product-title">Pixel 8a</span>
  <span class="product-price">25000</span>
  <span class="product-rating">4.3</span>
</article>
<article class="product-item">
  <span class="product-title">Redmi Note 13</span>
  <span class="product-price">18000</span>
  <span class="product-rating">3.8</span>
</article>
</body>
</html>`;

/**
 * Ordering-test mock page — three products, ALL pass "under 30000, rating > 4".
 * Designed to validate the sort contract precisely:
 *   TopRated Phone      — 20000 / 4.9  → wins on rating
 *   Tie Cheap Phone     — 16000 / 4.5  → wins tie-break (cheaper)
 *   Tie Expensive Phone — 28000 / 4.5  → loses tie-break (pricier)
 * After aggregation (top 2): [TopRated, Tie Cheap].
 */
const MOCK_ORDERING_HTML = `<!DOCTYPE html>
<html>
<head><title>Ordering Test Results</title></head>
<body>
<article class="product-item">
  <span class="product-title">TopRated Phone</span>
  <span class="product-price">20000</span>
  <span class="product-rating">4.9</span>
</article>
<article class="product-item">
  <span class="product-title">Tie Cheap Phone</span>
  <span class="product-price">16000</span>
  <span class="product-rating">4.5</span>
</article>
<article class="product-item">
  <span class="product-title">Tie Expensive Phone</span>
  <span class="product-price">28000</span>
  <span class="product-rating">4.5</span>
</article>
</body>
</html>`;

// ─── Suite-level shared state ─────────────────────────────────────────────────

let browser: Browser;
let sdk: AutomationSDK;

beforeAll(async () => {
  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  sdk = new AutomationSDK({
    browserWSEndpoint: browser.wsEndpoint(),
    defaultTimeout: 15000,
    retries: 1,
    retryDelay: 200,
  });
  await sdk.connect();

  // ── Warmup ──────────────────────────────────────────────────────────────────
  // Run one full intercepted navigation before any test exercises an aborted
  // navigation.  On a cold browser, the very first req.abort() call can cause
  // Chrome to navigate to a chrome-error:// page whose loading may not finish
  // before the next page.goto() starts, resetting Puppeteer's interception
  // state and allowing the subsequent request to reach the real network instead
  // of the mock handler.  This warmup drives Chrome through the
  // enable-interception → respond → disable-interception cycle once so that all
  // subsequent tests start with a fully-primed browser state.
  const page = await sdk.getPage();
  await page.setRequestInterception(true);
  const warmupHandler = (req: HTTPRequest): void => {
    void req.respond({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<html><body>warmup</body></html>',
    });
  };
  page.on('request', warmupHandler);
  try {
    await page.goto('http://warmup.test/', { waitUntil: 'domcontentloaded' });
  } finally {
    page.off('request', warmupHandler);
    await page.setRequestInterception(false);
  }
}, 60000);

afterAll(async () => {
  await sdk.disconnect();
  await browser.close();
});

// ─── Hostname helpers (CodeQL-safe: compare full hostname, not substring) ─────

function isAmazonHost(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === 'www.amazon.in' || hostname === 'amazon.in';
  } catch {
    return false;
  }
}

function isFlipkartHost(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === 'www.flipkart.com' || hostname === 'flipkart.com';
  } catch {
    return false;
  }
}

// ─── Interception helper ──────────────────────────────────────────────────────

/**
 * Enables request interception, runs `action`, then disables interception.
 * The caller supplies the per-request handler so each test can define its own
 * abort / respond / continue logic.
 */
async function withCustomInterception<T>(
  handler: (req: HTTPRequest) => void,
  action: () => Promise<T>,
): Promise<T> {
  const page = await sdk.getPage();
  await page.setRequestInterception(true);
  page.on('request', handler);
  try {
    return await action();
  } finally {
    page.off('request', handler);
    await page.setRequestInterception(false);
  }
}

// ─── Part 1: Partial failure ──────────────────────────────────────────────────

describe('Phase 3 Hardening — Partial Failure', () => {
  it('continues and returns Flipkart results when the Amazon request is aborted', async () => {
    const handler = (req: HTTPRequest): void => {
      if (isAmazonHost(req.url())) {
        // Simulate Amazon being unreachable — page.goto throws inside executeTask,
        // which GoalRunner catches and skips while continuing with the remaining tasks.
        void req.abort('failed');
      } else if (isFlipkartHost(req.url())) {
        void req.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: MOCK_PRODUCT_HTML,
        });
      } else {
        void req.continue();
      }
    };

    const result = await withCustomInterception(handler, () =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    // System must not throw even though one of the two tasks failed.
    expect(result).toBeDefined();
    expect(Array.isArray(result.topProducts)).toBe(true);

    // Flipkart responded with mock products — at least one result expected.
    expect(result.topProducts.length).toBeGreaterThan(0);

    // Every returned product must satisfy the applied filters.
    result.topProducts.forEach(p => {
      expect(p.price).toBeLessThan(30000);
      expect(p.rating).toBeGreaterThan(4);
    });
  });
});

// ─── Part 2: Ordering validation ─────────────────────────────────────────────

describe('Phase 3 Hardening — Ordering Validation', () => {
  it('returns top products sorted by rating DESC, then price ASC on tie', async () => {
    // Abort Amazon so that products come exclusively from Flipkart, making the
    // sort behaviour fully predictable with a known three-product dataset.
    const handler = (req: HTTPRequest): void => {
      if (isAmazonHost(req.url())) {
        void req.abort('failed');
      } else if (isFlipkartHost(req.url())) {
        void req.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: MOCK_ORDERING_HTML,
        });
      } else {
        void req.continue();
      }
    };

    const result = await withCustomInterception(handler, () =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    // All three mock products pass the filters; aggregation keeps top 2.
    expect(result.topProducts.length).toBe(2);

    // Primary sort: rating DESC — highest-rated product must be first.
    expect(result.topProducts[0].title).toBe('TopRated Phone');

    // Secondary sort: price ASC on rating tie — cheaper phone wins.
    expect(result.topProducts[1].title).toBe('Tie Cheap Phone');

    // Structural invariant: rating is non-increasing across the list.
    expect(result.topProducts[0].rating).toBeGreaterThanOrEqual(
      result.topProducts[1].rating,
    );
  });
});

// ─── Part 3: Non-ecommerce workflow ──────────────────────────────────────────

describe('Phase 3 Hardening — Non-Ecommerce Workflow', () => {
  it('LOGIN intent: does not throw and returns a structured result', async () => {
    // No interception needed — LOGIN produces a generic task with no steps,
    // so goal-runner performs no navigation and touches no network.
    const result = await sdk.executeGoal('Login to portal using email and password');

    expect(result).toBeDefined();
    expect(result.intent.type).toBe('LOGIN');
    expect(Array.isArray(result.topProducts)).toBe(true);
    // No products are expected for a non-product intent.
    expect(result.topProducts).toHaveLength(0);
  });
});

// ─── Part 4: Performance signal ──────────────────────────────────────────────

describe('Phase 3 Hardening — Performance Signal', () => {
  it('executeGoal with mock interception completes within a reasonable time', async () => {
    const handler = (req: HTTPRequest): void => {
      if (isAmazonHost(req.url()) || isFlipkartHost(req.url())) {
        void req.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: MOCK_PRODUCT_HTML,
        });
      } else {
        void req.continue();
      }
    };

    const start = Date.now();
    await withCustomInterception(handler, () =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );
    const durationMs = Date.now() - start;

    // Capture a performance signal.  This is a soft bound, not a hard SLA:
    // mock interception removes all network latency, so 10 s is very generous.
    console.log(`[perf] executeGoal duration: ${durationMs}ms`);
    expect(durationMs).toBeLessThan(10_000);
  });
});
