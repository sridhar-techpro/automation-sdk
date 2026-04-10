/**
 * Phase 3 — AI-Native goal execution E2E test.
 *
 * Design:
 *  - Launches a real Chrome instance via puppeteer-core (no mocks).
 *  - Connects the AutomationSDK to it via CDP.
 *  - Uses Puppeteer request interception to respond to amazon.in / flipkart.com
 *    navigation with self-contained mock HTML containing known products, so no
 *    real internet access is needed and the test is fully deterministic.
 *  - Exercises the complete sdk.executeGoal() pipeline end-to-end.
 *
 * Constraints:
 *  - Never call browser.newPage() while the SDK is connected.
 *  - Never call page.bringToFront() in headless Chrome.
 *  - Let browser.close() in afterAll handle cleanup.
 */
import * as puppeteer from 'puppeteer-core';
import type { Browser, HTTPRequest } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

/**
 * Self-contained HTML page that simulates a product search result page.
 * Products that pass the "under 30000, rating > 4" filters:
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
}, 60000);

afterAll(async () => {
  await sdk.disconnect();
  await browser.close();
});

/** Returns true when the URL belongs to the amazon.in or flipkart.com hostname. */
function isInterceptTarget(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === 'www.amazon.in'    || hostname === 'amazon.in' ||
           hostname === 'www.flipkart.com' || hostname === 'flipkart.com';
  } catch {
    return false;
  }
}

// ─── Helper: intercept amazon/flipkart navigation and serve mock HTML ─────────

async function withMockInterception<T>(action: () => Promise<T>): Promise<T> {
  const page = await sdk.getPage();
  await page.setRequestInterception(true);

  const handler = (req: HTTPRequest): void => {
    if (isInterceptTarget(req.url())) {
      void req.respond({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: MOCK_PRODUCT_HTML,
      });
    } else {
      void req.continue();
    }
  };

  page.on('request', handler);
  try {
    return await action();
  } finally {
    page.off('request', handler);
    await page.setRequestInterception(false);
  }
}

// ─── E2E Test Suite ───────────────────────────────────────────────────────────

describe('E2E: sdk.executeGoal()', () => {
  it('executeGoal works end-to-end and returns topProducts', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    expect(result).toBeDefined();
    expect(result.topProducts.length).toBeGreaterThan(0);
  });

  it('returned products satisfy the price and rating constraints', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    expect(result.topProducts.length).toBeGreaterThan(0);
    result.topProducts.forEach(p => {
      expect(p.price).toBeLessThan(30000);
      expect(p.rating).toBeGreaterThan(4);
    });
  });

  it('returns at most 2 products (top-N aggregation)', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    expect(result.topProducts.length).toBeLessThanOrEqual(2);
  });

  it('products and topProducts contain the same results', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    expect(result.products).toEqual(result.topProducts);
  });

  it('intent is correctly parsed from natural language input', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Suggest smartphones under 30000 with rating above 4'),
    );

    expect(result.intent.type).toBe('SEARCH_PRODUCT');
    expect(result.intent.filters.priceMax).toBe(30000);
    expect(result.intent.filters.ratingMin).toBe(4);
  });

  it('executes across multiple sites (multi-task)', async () => {
    const page = await sdk.getPage();
    await page.setRequestInterception(true);

    const navigatedUrls: string[] = [];
    const handler = (req: HTTPRequest): void => {
      const url = req.url();
      if (isInterceptTarget(url)) {
        navigatedUrls.push(url);
        void req.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: MOCK_PRODUCT_HTML,
        });
      } else {
        void req.continue();
      }
    };

    page.on('request', handler);
    try {
      await sdk.executeGoal('Suggest smartphones under 30000 with rating above 4');
    } finally {
      page.off('request', handler);
      await page.setRequestInterception(false);
    }

    expect(navigatedUrls.some(u => u.includes('amazon.in'))).toBe(true);
    expect(navigatedUrls.some(u => u.includes('flipkart.com'))).toBe(true);
  });

  it('handles "below" price variation correctly in a real run', async () => {
    const result = await withMockInterception(() =>
      sdk.executeGoal('Find phones below 30000 with rating above 4'),
    );

    expect(result.intent.filters.priceMax).toBe(30000);
    expect(result.topProducts.length).toBeGreaterThan(0);
  });

  it('returns a result (not throws) when goal produces no matching products', async () => {
    // Filters that no mock product can satisfy (price < 5000 AND rating > 4)
    const result = await withMockInterception(() =>
      sdk.executeGoal('Find phones under 5000 with rating above 4'),
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result.topProducts)).toBe(true);
    expect(result.topProducts).toHaveLength(0);
  });
});
