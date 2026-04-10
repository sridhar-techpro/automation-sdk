/**
 * Reliability Engine E2E tests — Dynamic UI, Scroll & Load Handling
 *
 * Covers:
 *   1. Scroll discovery  — element only exists in DOM after scrolling into view
 *   2. Dynamic load      — element appears after a setTimeout delay
 *   3. Event-driven UI   — click → dropdown appears → select option
 *   4. Lazy loading      — scroll → scroll-event creates content → interact
 *   5. Multi-step chain  — click → field appears → type → submit → result
 *
 * Design constraints (same as other E2E suites):
 *   - Never call browser.newPage() while SDK is connected.
 *   - Never call bringToFront() in headless Chrome.
 *   - Let browser.close() in afterAll handle tab clean-up.
 *   - All interactive buttons use type="button" to prevent form reloads.
 */
import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// ── Test page HTML ────────────────────────────────────────────────────────────
//
// Layout (top → bottom):
//   0 px   – above-fold: event-driven, multi-step, dynamic-load elements
//   2000 px – spacer
//   2000 px – #scroll-sentinel  → IntersectionObserver creates #below-fold-btn
//   2350 px – #lazy-sentinel    → scroll event creates #lazy-content
//
const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Reliability Engine Test</title>
  <style>
    body { margin: 0; padding: 20px; }
    .rh-hidden { display: none; }
  </style>
</head>
<body>

  <!-- ── TEST 2: Dynamic load ─────────────────────────────────────────── -->
  <div id="dynamic-result" class="rh-hidden">Dynamic Clicked</div>

  <!-- ── TEST 3: Event-driven UI ──────────────────────────────────────── -->
  <button type="button" id="trigger-btn">Open Dropdown</button>
  <div id="dropdown" class="rh-hidden">
    <button type="button" id="dropdown-opt">Option 1</button>
  </div>
  <div id="event-result" class="rh-hidden">Event Option Selected</div>

  <!-- ── TEST 5: Multi-step chained interaction ────────────────────────── -->
  <button type="button" id="ms-trigger">Step 1: Open Field</button>
  <div id="ms-field-wrapper" class="rh-hidden">
    <input type="text" id="ms-field" placeholder="Enter value" />
    <button type="button" id="ms-submit">Submit</button>
  </div>
  <div id="ms-result" class="rh-hidden">Submitted</div>

  <!-- ── 2 000 px spacer ──────────────────────────────────────────────── -->
  <div style="height:2000px"></div>

  <!-- ── TEST 1: Scroll sentinel (IntersectionObserver) ───────────────── -->
  <div id="scroll-sentinel"></div>
  <div id="scroll-result" class="rh-hidden">Scroll Found</div>

  <!-- ── TEST 4: Lazy-loading sentinel (scroll event) ─────────────────── -->
  <div id="lazy-sentinel" style="margin-top:350px"></div>
  <div id="lazy-result" class="rh-hidden">Lazy Clicked</div>

  <script>
    // ── Test 2: dynamic button added after 600 ms ─────────────────────
    setTimeout(function () {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'dynamic-btn';
      btn.textContent = 'Dynamic Button';
      btn.addEventListener('click', function () {
        document.getElementById('dynamic-result').classList.remove('rh-hidden');
      });
      var ref = document.getElementById('dynamic-result');
      ref.parentNode.insertBefore(btn, ref);
    }, 600);

    // ── Test 3: event-driven dropdown ────────────────────────────────
    document.getElementById('trigger-btn').addEventListener('click', function () {
      document.getElementById('dropdown').classList.remove('rh-hidden');
    });
    document.getElementById('dropdown-opt').addEventListener('click', function () {
      document.getElementById('event-result').classList.remove('rh-hidden');
    });

    // ── Test 5: multi-step ───────────────────────────────────────────
    document.getElementById('ms-trigger').addEventListener('click', function () {
      document.getElementById('ms-field-wrapper').classList.remove('rh-hidden');
    });
    document.getElementById('ms-submit').addEventListener('click', function () {
      document.getElementById('ms-result').classList.remove('rh-hidden');
    });

    // ── Test 1: IntersectionObserver creates #below-fold-btn ─────────
    new IntersectionObserver(function (entries, obs) {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'below-fold-btn';
      btn.textContent = 'Below Fold Button';
      btn.addEventListener('click', function () {
        document.getElementById('scroll-result').classList.remove('rh-hidden');
      });
      var ref = document.getElementById('scroll-result');
      ref.parentNode.insertBefore(btn, ref);
    }).observe(document.getElementById('scroll-sentinel'));

    // ── Test 4: scroll event creates #lazy-content ───────────────────
    function onScroll() {
      if (document.getElementById('lazy-content')) return;
      var sentinel = document.getElementById('lazy-sentinel');
      if (!sentinel) return;
      var rect = sentinel.getBoundingClientRect();
      if (rect.top > window.innerHeight) return;
      window.removeEventListener('scroll', onScroll);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'lazy-content';
      btn.textContent = 'Lazy Content Button';
      btn.addEventListener('click', function () {
        document.getElementById('lazy-result').classList.remove('rh-hidden');
      });
      var ref = document.getElementById('lazy-result');
      ref.parentNode.insertBefore(btn, ref);
    }
    window.addEventListener('scroll', onScroll);
  </script>
</body>
</html>`;

// ── Suite scaffolding ─────────────────────────────────────────────────────────

let server: http.Server;
let serverPort: number;
let browser: Browser;
let wsEndpoint: string;
let sdk: AutomationSDK;

function testUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

async function navigateToTest(): Promise<void> {
  const page = await sdk.getPage();
  await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });
}

beforeAll(async () => {
  // ── HTTP server ──────────────────────────────────────────────────────────
  await new Promise<void>((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(TEST_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      serverPort = addr.port;
      resolve();
    });
  });

  // ── Chrome ───────────────────────────────────────────────────────────────
  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  wsEndpoint = browser.wsEndpoint();

  // ── SDK ──────────────────────────────────────────────────────────────────
  sdk = new AutomationSDK({
    browserWSEndpoint: wsEndpoint,
    defaultTimeout: 15000,
    retries: 2,
    retryDelay: 300,
  });
  await sdk.connect();
  await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
}, 60000);

afterAll(async () => {
  if (sdk.isConnected()) await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Scroll Discovery
// ─────────────────────────────────────────────────────────────────────────────

describe('Reliability Engine — 1. Scroll Discovery', () => {
  beforeEach(navigateToTest);

  it('finds #below-fold-btn (created by IntersectionObserver after scrolling) and clicks it', async () => {
    // The element does not exist in the DOM until the IntersectionObserver fires,
    // which requires the page to scroll past the 2000 px spacer first.
    const el = await sdk.findWithScroll('#below-fold-btn', {
      scrollStep: 500,
      maxScrolls: 12,
      waitAfterScroll: 300,
      timeout: 20000,
    });
    await el.click();

    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#scroll-result',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('locator.scrollFind() finds #below-fold-btn and returns a clickable handle', async () => {
    const el = await sdk.locator('#below-fold-btn').scrollFind({
      scrollStep: 500,
      maxScrolls: 12,
      waitAfterScroll: 300,
      timeout: 20000,
    });
    await el.click();

    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#scroll-result',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dynamic Load
// ─────────────────────────────────────────────────────────────────────────────

describe('Reliability Engine — 2. Dynamic Load', () => {
  beforeEach(navigateToTest);

  it('waits for #dynamic-btn (appears after 600 ms) then clicks it', async () => {
    // The SDK locator uses waitForSelector which smartly waits for the element
    // to appear — no hardcoded sleep needed.
    await sdk.locator('#dynamic-btn').click();

    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#dynamic-result',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('waitForLoadState("domcontentloaded") resolves for a loaded page', async () => {
    await expect(sdk.waitForLoadState('domcontentloaded', 5000)).resolves.toBeUndefined();
  });

  it('waitForLoadState("networkidle") resolves once no more requests are in flight', async () => {
    // Static HTML page → network idle is reached quickly after navigation
    await expect(sdk.waitForLoadState('networkidle', 10000)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Event-Driven UI
// ─────────────────────────────────────────────────────────────────────────────

describe('Reliability Engine — 3. Event-Driven UI', () => {
  beforeEach(navigateToTest);

  it('click trigger → dropdown appears → select option via waitForElementAfterAction', async () => {
    // Arm the wait for #dropdown-opt BEFORE triggering the action so we cannot
    // miss a fast DOM update.
    const opt = await sdk.waitForElementAfterAction(
      async () => { await sdk.locator('#trigger-btn').click(); },
      '#dropdown-opt',
      { timeout: 5000 },
    );

    // The returned handle is the newly-visible option; click it.
    await opt.click();

    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#event-result',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('dropdown is hidden before trigger click and visible after', async () => {
    const page = await sdk.getPage();

    const hiddenBefore = await page.$eval(
      '#dropdown',
      (e) => window.getComputedStyle(e as HTMLElement).display === 'none',
    );
    expect(hiddenBefore).toBe(true);

    await sdk.locator('#trigger-btn').click();
    await page.waitForSelector('#dropdown', { visible: true, timeout: 5000 });

    const visibleAfter = await page.$eval(
      '#dropdown',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visibleAfter).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Lazy Loading
// ─────────────────────────────────────────────────────────────────────────────

describe('Reliability Engine — 4. Lazy Loading', () => {
  beforeEach(navigateToTest);

  it('scrolls until lazy content (created by scroll event) loads then clicks it', async () => {
    // #lazy-content is injected by a scroll-event listener when #lazy-sentinel
    // enters the viewport — it does NOT exist in DOM until scroll triggers it.
    const el = await sdk.locator('#lazy-content').scrollFind({
      scrollStep: 400,
      maxScrolls: 20,
      waitAfterScroll: 300,
      timeout: 25000,
    });
    await el.click();

    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#lazy-result',
      (e) => window.getComputedStyle(e as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Multi-Step Chained Interaction
// ─────────────────────────────────────────────────────────────────────────────

describe('Reliability Engine — 5. Multi-Step Chained Interaction', () => {
  beforeEach(navigateToTest);

  it('click → new field appears → type → submit → result shows', async () => {
    // Step 1: click the trigger; wait for the input field to appear
    const field = await sdk.waitForElementAfterAction(
      async () => { await sdk.locator('#ms-trigger').click(); },
      '#ms-field',
      { timeout: 5000 },
    );

    // Step 2: fill the revealed input
    await field.click({ clickCount: 3 });
    await field.type('reliability');

    // Step 3: click submit; wait for the result element to appear
    const result = await sdk.waitForElementAfterAction(
      async () => { await sdk.locator('#ms-submit').click(); },
      '#ms-result',
      { timeout: 5000 },
    );

    const text = await result.evaluate((e) => (e as HTMLElement).textContent);
    expect(text).toBe('Submitted');
  });

  it('field has the typed value after multi-step flow', async () => {
    const page = await sdk.getPage();

    await sdk.waitForElementAfterAction(
      async () => { await sdk.locator('#ms-trigger').click(); },
      '#ms-field',
      { timeout: 5000 },
    );

    await sdk.locator('#ms-field').type('hello-world');

    const value = await page.$eval('#ms-field', (e) => (e as HTMLInputElement).value);
    expect(value).toBe('hello-world');
  });
});
