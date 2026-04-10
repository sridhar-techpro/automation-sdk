/**
 * Phase 2 E2E tests — Locator system, advanced selectors, frame support,
 * shadow DOM, multi-tab management, and screenshot.
 *
 * Design constraints (same as sdk.e2e.test.ts):
 *  - Never call browser.newPage() while the SDK is connected.
 *  - Never call bringToFront() in headless Chrome.
 *  - Let browser.close() in afterAll handle tab clean-up.
 *  - Multi-tab tests are placed LAST to avoid disconnect/reconnect affecting
 *    other test groups.
 */
import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// NOTE: All interactive buttons use type="button" to prevent accidental form
// submission which would cause page reloads mid-test.
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Phase 2 Test</title></head>
<body>
  <!-- Locator list items -->
  <ul id="items">
    <li class="item">Apple</li>
    <li class="item">Banana</li>
    <li class="item special">Cherry</li>
  </ul>

  <!-- Advanced-selector elements -->
  <label for="email">Email Address</label>
  <input id="email" type="email" placeholder="Enter email" data-testid="email-input" />

  <label for="pass">Password</label>
  <input id="pass" type="password" placeholder="Enter password" data-testid="pass-input" />

  <button type="button" id="submit-btn" role="button" aria-label="Submit Form"
          data-testid="submit-btn">Submit</button>

  <!-- Result panel -->
  <div id="result" style="display:none">Action Completed</div>

  <!-- iframe (type="button" on inner button prevents form submit) -->
  <iframe id="frame1" srcdoc="
    <!DOCTYPE html><html><body>
      <button type='button' id='frame-btn'>Frame Button</button>
      <div id='frame-result' style='display:none'>Frame Clicked</div>
      <script>
        document.getElementById('frame-btn').addEventListener('click', function() {
          document.getElementById('frame-result').style.display = 'block';
        });
      <\/script>
    </body></html>
  "></iframe>

  <!-- Shadow DOM host -->
  <div id="shadow-host"></div>

  <script>
    document.getElementById('submit-btn').addEventListener('click', function() {
      document.getElementById('result').style.display = 'block';
      document.getElementById('result').textContent = 'Action Completed';
    });

    document.querySelectorAll('.item').forEach(function(item) {
      item.addEventListener('click', function() {
        document.getElementById('result').style.display = 'block';
        document.getElementById('result').textContent = item.textContent;
      });
    });

    var host = document.getElementById('shadow-host');
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<button type="button" id="shadow-btn">Shadow Button</button>' +
      '<div id="shadow-result" style="display:none">Shadow Clicked</div>';
    shadow.getElementById('shadow-btn').addEventListener('click', function() {
      shadow.getElementById('shadow-result').style.display = 'block';
    });
  </script>
</body>
</html>`;

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

  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  wsEndpoint = browser.wsEndpoint();

  sdk = new AutomationSDK({
    browserWSEndpoint: wsEndpoint,
    defaultTimeout: 15000,
    retries: 2,
    retryDelay: 200,
  });
  await sdk.connect();
  await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
}, 60000);

afterAll(async () => {
  if (sdk.isConnected()) await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Test Group 1: Locator System ─────────────────────────────────────────────

describe('Phase 2 — Locator System', () => {
  beforeEach(navigateToTest);

  it('locator.click() works for a simple CSS selector', async () => {
    await sdk.locator('#submit-btn').click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Action Completed');
  });

  it('locator.nth(0) clicks the first list item', async () => {
    await sdk.locator('.item').nth(0).click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Apple');
  });

  it('locator.first() clicks the first list item', async () => {
    await sdk.locator('.item').first().click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Apple');
  });

  it('locator.last() clicks the last list item', async () => {
    await sdk.locator('.item').last().click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Cherry');
  });

  it('locator.nth(1) clicks the second list item', async () => {
    await sdk.locator('.item').nth(1).click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Banana');
  });

  it('locator.filter({ hasText }) clicks the matching item', async () => {
    await sdk.locator('.item').filter({ hasText: 'Banana' }).click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Banana');
  });

  it('locator.filter chained with first() clicks first matching item', async () => {
    await sdk.locator('.item').filter({ hasText: 'Cherry' }).first().click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Cherry');
  });

  it('locator.locator(child) resolves within parent context', async () => {
    await sdk.locator('#items').locator('.item').first().click();
    const page = await sdk.getPage();
    const text = await page.$eval('#result', (el) => (el as HTMLElement).textContent);
    expect(text).toBe('Apple');
  });

  it('locator.type() types into an input', async () => {
    await sdk.locator('#email').type('user@example.com');
    const page = await sdk.getPage();
    const value = await page.$eval('#email', (el) => (el as HTMLInputElement).value);
    expect(value).toBe('user@example.com');
  });
});

// ─── Test Group 2: Selector Execution ────────────────────────────────────────

describe('Phase 2 — Selector Execution', () => {
  beforeEach(navigateToTest);

  it('executes a CSS selector via locator', async () => {
    await sdk.locator('#submit-btn').click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('executes an XPath selector via locator (xpath= prefix)', async () => {
    await sdk.locator('xpath=//button[@id="submit-btn"]').click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('executes a bare XPath (//) via locator', async () => {
    await sdk.locator('//button[@data-testid="submit-btn"]').click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('locator throws a descriptive error for a non-existent selector', async () => {
    const fastSdk = new AutomationSDK({
      browserWSEndpoint: wsEndpoint,
      defaultTimeout: 1500,
      retries: 0,
      retryDelay: 0,
    });
    await fastSdk.connect();
    const page = await fastSdk.getPage();
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });
    try {
      await expect(fastSdk.locator('#does-not-exist').click()).rejects.toThrow();
    } finally {
      await fastSdk.disconnect();
    }
  });
});

// ─── Test Group 3: Frame Handling ─────────────────────────────────────────────

describe('Phase 2 — Frame Handling', () => {
  beforeEach(navigateToTest);

  it('clicks a button inside an iframe', async () => {
    await sdk.frame('#frame1').locator('#frame-btn').click();

    const page = await sdk.getPage();
    const frameEl = await page.$('#frame1');
    if (!frameEl) throw new Error('iframe element not found');
    const frame = await frameEl.contentFrame();
    if (!frame) throw new Error('Could not get content frame');

    const visible = await frame.$eval(
      '#frame-result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });
});

// ─── Test Group 4: Shadow DOM ─────────────────────────────────────────────────

describe('Phase 2 — Shadow DOM', () => {
  beforeEach(navigateToTest);

  it('clicks a button inside a shadow root using >>> selector', async () => {
    const page = await sdk.getPage();
    await page.waitForSelector('#shadow-host >>> #shadow-btn', { timeout: 5000 });
    const btn = await page.$('#shadow-host >>> #shadow-btn');
    expect(btn).not.toBeNull();
    await btn!.click();

    const resultEl = await page.$('#shadow-host >>> #shadow-result');
    expect(resultEl).not.toBeNull();
    const visible = await resultEl!.evaluate(
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('resolves shadow DOM element via shadow= selector', async () => {
    await sdk.locator('shadow=#shadow-btn').click();

    const page = await sdk.getPage();
    const resultEl = await page.$('#shadow-host >>> #shadow-result');
    expect(resultEl).not.toBeNull();
    const visible = await resultEl!.evaluate(
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });
});

// ─── Test Group 5: Advanced Selectors ────────────────────────────────────────

describe('Phase 2 — Advanced Selectors', () => {
  beforeEach(navigateToTest);

  it('getByTestId finds and clicks the submit button', async () => {
    await sdk.getByTestId('submit-btn').click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('getByPlaceholder finds the email input and types into it', async () => {
    await sdk.getByPlaceholder('Enter email').type('hello@test.com');
    const page = await sdk.getPage();
    const value = await page.$eval('#email', (el) => (el as HTMLInputElement).value);
    expect(value).toBe('hello@test.com');
  });

  it('getByLabel finds the email input via its associated label', async () => {
    await sdk.getByLabel('Email Address').type('label@test.com');
    const page = await sdk.getPage();
    const value = await page.$eval('#email', (el) => (el as HTMLInputElement).value);
    expect(value).toBe('label@test.com');
  });

  it('getByText finds the submit button by its text content', async () => {
    await sdk.getByText('Submit').click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });

  it('getByRole finds a button by role and aria-label', async () => {
    await sdk.getByRole('button', { name: 'Submit Form' }).click();
    const page = await sdk.getPage();
    const visible = await page.$eval(
      '#result',
      (el) => window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(visible).toBe(true);
  });
});

// ─── Test Group 6: Screenshot ─────────────────────────────────────────────────

describe('Phase 2 — Screenshot', () => {
  beforeEach(navigateToTest);

  it('sdk.screenshot() returns a non-empty Buffer', async () => {
    const buf = await sdk.screenshot();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('locator.screenshot() returns a non-empty Buffer for a matched element', async () => {
    const buf = await sdk.locator('#submit-btn').screenshot();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ─── Test Group 7: Multi-Tab Management ──────────────────────────────────────
//
// Multi-tab tests are placed LAST to avoid the disconnect/reconnect cycle
// from affecting other test groups.

describe('Phase 2 — Multi-Tab Management', () => {
  it('getTabs() returns the open tabs', async () => {
    const tabs = await sdk.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('switchToTab(0) returns the first page', async () => {
    const tab0 = await sdk.switchToTab(0);
    expect(tab0).toBeDefined();
    expect(tab0.isClosed()).toBe(false);
  });

  it('switchToTab() throws for an out-of-bounds index', async () => {
    await expect(sdk.switchToTab(999)).rejects.toThrow('out of bounds');
  });

  it('executeOnTab runs an action on the specified tab', async () => {
    const url = await sdk.executeOnTab(0, async (page) => page.url());
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('multi-tab: disconnect → open second tab → reconnect → executeOnTab(1, ...)', async () => {
    // Disconnect first so newPage() does not disrupt the SDK's CDP session.
    await sdk.disconnect();

    const tab2 = await browser.newPage();
    await tab2.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    // Reconnect — adapter picks up pages[0] (the original SDK tab).
    await sdk.connect();
    const sdkPage = await sdk.getPage();
    await sdkPage.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const tabs = await sdk.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    const tabUrl = await sdk.executeOnTab(1, async (page) => page.url());
    expect(tabUrl).toContain('127.0.0.1');

    // DO NOT close tab2 here — closing a tab that shares a renderer process
    // with the SDK's tab can trigger Runtime.executionContextsCleared on the
    // SDK's tab, invalidating its execution context.  browser.close() in
    // afterAll cleans up all remaining tabs.
  });
});
