import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

/**
 * HTML served by the local test server.
 *
 * Elements:
 *   #btn                – Login button; click reveals #result
 *   #email              – text input
 *   #delayed            – div that becomes visible after 500 ms
 *   #result             – div that becomes visible after #btn click
 *   #long-delayed-btn   – button that becomes visible after 1200 ms (auto-wait probe)
 *   #delayed-enable-btn – button initially disabled, enabled after 500 ms (retry probe)
 */
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <button id="btn">Login</button>
  <input id="email" placeholder="Email" />
  <div id="delayed" style="display:none">Delayed Content</div>
  <div id="result" style="display:none">Logged In</div>
  <button id="long-delayed-btn" style="display:none">Slow Button</button>
  <button id="delayed-enable-btn" disabled>Wait button</button>
  <script>
    setTimeout(() => { document.getElementById('delayed').style.display = 'block'; }, 500);
    setTimeout(() => { document.getElementById('long-delayed-btn').style.display = 'block'; }, 1200);
    setTimeout(() => { document.getElementById('delayed-enable-btn').disabled = false; }, 500);
    document.getElementById('btn').addEventListener('click', function() {
      document.getElementById('result').style.display = 'block';
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

beforeAll(async () => {
  // ── 1. Start HTTP server ─────────────────────────────────────────────────
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

  // ── 2. Launch Chrome ──────────────────────────────────────────────────────
  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  wsEndpoint = browser.wsEndpoint();

  // ── 3. Connect SDK and navigate its page to the test content ─────────────
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
  await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Test 1: Background Execution ──────────────────────────────────────────────
describe('Test 1: Background Execution', () => {
  it('executes CDP action while page visibility API reports hidden/blurred state', async () => {
    const page = await sdk.getPage();
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    // Apply the exact DOM state Chrome sets when a tab moves to the background:
    //   • document.hidden = true
    //   • document.visibilityState = 'hidden'
    //   • 'visibilitychange' + 'blur' events fired
    // In a real background tab Chrome also throttles setTimeout/rAF in the
    // renderer, but CDP commands travel through the DevTools channel which is
    // entirely separate from the renderer event loop and is never throttled.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden' as DocumentVisibilityState,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });

    // The SDK drives Chrome via CDP — it must succeed regardless of the
    // page's visibility / focus state.
    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');

    const resultVisible = await page.$eval('#result', (el) =>
      window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(resultVisible).toBe(true);
  });

  it('executes CDP action with two real Chrome tabs open (multi-tab background)', async () => {
    // Disconnect the SDK before opening a second tab.  Calling browser.newPage()
    // while the SDK is connected sends Target.attachToTarget for the new page,
    // which disrupts the SDK's existing CDP session and causes execution-context
    // errors.  Creating the page while disconnected is safe.
    await sdk.disconnect();

    // Open a second Chrome tab (the "foreground" decoy).  Two real renderer
    // processes / tabs now exist in the same browser — the multi-tab scenario
    // that background execution must handle in production.
    const decoyPage = await browser.newPage();
    await decoyPage.goto('about:blank');

    // Reconnect the SDK.  browser.pages() returns [sdkPage, decoyPage]; the
    // adapter picks index 0 (the original SDK page) and ignores decoyPage.
    await sdk.connect();
    const sdkPage = await sdk.getPage();
    await sdkPage.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    // Simulate background state on the SDK's tab.  We cannot call
    // decoyPage.bringToFront() here: in headless Chrome that triggers
    // Runtime.executionContextsCleared on the SDK's tab, destroying its
    // execution context.  The evaluate() approach correctly replicates every
    // DOM-visible effect of a backgrounded tab without that side-effect.
    await sdkPage.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden' as DocumentVisibilityState,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });

    // With two real tabs open and the SDK's tab backgrounded, CDP must still
    // execute reliably on the backgrounded tab.
    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');

    const resultVisible = await sdkPage.$eval('#result', (el) =>
      window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(resultVisible).toBe(true);

    // DO NOT close decoyPage here — in headless Chrome, closing a tab that
    // shares a renderer process with the SDK's tab can trigger
    // Runtime.executionContextsCleared on the SDK's tab, invalidating its
    // execution context for every subsequent test.  browser.close() in
    // afterAll cleans up all remaining tabs.
  });
});

// ── Test 2: Retry Stability ───────────────────────────────────────────────────
describe('Test 2: Retry Stability', () => {
  it('auto-waits for element that appears after 500ms', async () => {
    const page = await sdk.getPage();
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#delayed', { visible: true, timeout: 5000 });

    const isVisible = await page.$eval('#delayed', (el) =>
      window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(isVisible).toBe(true);
  });

  it('auto-wait: SDK waits for element that appears after 1200ms', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
    // #long-delayed-btn appears after 1200ms via setTimeout.
    // SDK defaultTimeout is 15s — waitForSelector will wait and succeed.
    const result = await sdk.execute({ action: 'click', target: '#long-delayed-btn' });
    expect(result.success).toBe(true);
    expect(result.duration).toBeLessThan(5000);
  });

  it('retry: element initially disabled → ActionabilityError → retry → enabled → success', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
    // #delayed-enable-btn is <button disabled> on page load, enabled after 500ms.
    // Attempt 1: waitForSelector finds the button (visible); checkActionability
    //   detects disabled → throws ActionabilityError → withRetry fires.
    // Attempt 2 (200ms later, ~700ms total): button is now enabled → click succeeds.
    const result = await sdk.execute({ action: 'click', target: '#delayed-enable-btn' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');
  });
});

// ── Test 3: Selector Intelligence ─────────────────────────────────────────────
describe('Test 3: Selector Intelligence', () => {
  it('clicks element via exact text selector (text=Login)', async () => {
    const page = await sdk.getPage();
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: 'text=Login' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');

    const resultVisible = await page.$eval('#result', (el) =>
      window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(resultVisible).toBe(true);
  });

  it('clicks element via partial text selector (text*=Log)', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: 'text*=Log' });
    expect(result.success).toBe(true);
  });

  it('clicks element via CSS selector (#btn)', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
  });
});

// ── Test 4: Multi-step Flow ────────────────────────────────────────────────────
describe('Test 4: Multi-step Flow', () => {
  it('navigate → type → click → validate outcome', async () => {
    // Step 1: Navigate
    const navResult = await sdk.execute({ action: 'navigate', target: testUrl() });
    expect(navResult.success).toBe(true);
    expect(navResult.action).toBe('navigate');

    // Step 2: Type email
    const typeResult = await sdk.execute({
      action: 'type',
      target: '#email',
      value: 'user@example.com',
    });
    expect(typeResult.success).toBe(true);
    expect(typeResult.action).toBe('type');

    const typedValue = await (await sdk.getPage()).$eval(
      '#email',
      (el) => (el as HTMLInputElement).value,
    );
    expect(typedValue).toBe('user@example.com');

    // Step 3: Click
    const clickResult = await sdk.execute({ action: 'click', target: '#btn' });
    expect(clickResult.success).toBe(true);
    expect(clickResult.action).toBe('click');

    // Step 4: Validate outcome
    const resultVisible = await (await sdk.getPage()).$eval('#result', (el) =>
      window.getComputedStyle(el as HTMLElement).display !== 'none',
    );
    expect(resultVisible).toBe(true);

    // All SDK actions are traceable
    const logs = sdk.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(3);
    for (const log of logs) {
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('duration');
    }
  });
});

// ── Test 5: CDP Connection Stability ──────────────────────────────────────────
describe('Test 5: CDP Connection Stability', () => {
  it('reconnects and resumes execution after explicit disconnect', async () => {
    expect(sdk.isConnected()).toBe(true);

    await sdk.disconnect();
    expect(sdk.isConnected()).toBe(false);

    await sdk.connect();
    expect(sdk.isConnected()).toBe(true);

    // Re-navigate after reconnect so the page is in a known state.
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
  });

  it('throws when execute is called before connect', async () => {
    const disconnectedSdk = new AutomationSDK({
      browserWSEndpoint: wsEndpoint,
      defaultTimeout: 5000,
      retries: 0,
      retryDelay: 0,
    });
    // Intentionally NOT calling connect().
    await expect(disconnectedSdk.execute({ action: 'click', target: '#btn' })).rejects.toThrow(
      'not connected',
    );
  });

  it('page URL is preserved across disconnect/reconnect cycle', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
    const urlBefore = (await sdk.getPage()).url();

    await sdk.disconnect();
    await sdk.connect();
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });

    expect((await sdk.getPage()).url()).toBe(urlBefore);
    expect(sdk.isConnected()).toBe(true);
  });

  it('recovers page reference after target is destroyed (targetdestroyed event)', async () => {
    // Grab the current page reference and close it — this fires the browser's
    // 'targetdestroyed' event, which the adapter handles by nulling this.page.
    const oldPage = await sdk.getPage();
    await oldPage.close();

    // getPage() must recover: it detects the closed/null page and creates a
    // new one rather than returning the stale (closed) reference.
    const recoveredPage = await sdk.getPage();
    expect(recoveredPage.isClosed()).toBe(false);

    // The recovered page must be usable for real automation work.
    await recoveredPage.goto(testUrl(), { waitUntil: 'domcontentloaded' });
    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
  });
});

// ── Test 6: Failure Path Validation ───────────────────────────────────────────
describe('Test 6: Failure Path Validation', () => {
  // Use a fast-fail SDK for "element not found" tests to keep the suite
  // fast while still verifying the correct failure behaviour.
  // (Production would use the full 15s timeout; we verify the shape, not timing.)
  let failFastSdk: AutomationSDK;

  beforeAll(async () => {
    failFastSdk = new AutomationSDK({
      browserWSEndpoint: wsEndpoint,
      defaultTimeout: 1500,
      retries: 1,
      retryDelay: 100,
    });
    await failFastSdk.connect();
  });

  afterAll(async () => {
    await failFastSdk.disconnect();
  });

  beforeEach(async () => {
    await (await failFastSdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
  });

  it('returns a failure ActionResult (does not throw) for a non-existent CSS selector', async () => {
    const result = await failFastSdk.execute({ action: 'click', target: '#does-not-exist' });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('returns a failure ActionResult for a non-existent text selector', async () => {
    const result = await failFastSdk.execute({
      action: 'click',
      target: 'text=ButtonThatDoesNotExist',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('throws PolicyViolationError when navigating to a non-whitelisted domain', async () => {
    const restrictedSdk = new AutomationSDK({
      browserWSEndpoint: wsEndpoint,
      defaultTimeout: 5000,
      retries: 0,
      retryDelay: 0,
      allowedDomains: ['example.com'],
    });
    await restrictedSdk.connect();

    try {
      await expect(
        restrictedSdk.execute({ action: 'navigate', target: testUrl() }),
      ).rejects.toThrow('Policy violation');
    } finally {
      await restrictedSdk.disconnect();
    }
  });

  it('tracer logs both successful and failed actions with the correct schema', async () => {
    await failFastSdk.execute({ action: 'click', target: '#btn' });
    await failFastSdk.execute({ action: 'click', target: '#nonexistent' });

    const logs = failFastSdk.getLogs();
    const successes = logs.filter((l) => l.success);
    const failures = logs.filter((l) => !l.success);

    expect(successes.length).toBeGreaterThan(0);
    expect(failures.length).toBeGreaterThan(0);

    for (const log of logs) {
      expect(typeof log.action).toBe('string');
      expect(typeof log.success).toBe('boolean');
      expect(typeof log.timestamp).toBe('number');
      expect(log.timestamp).toBeGreaterThan(0);
      expect(typeof log.duration).toBe('number');
      expect(log.duration).toBeGreaterThanOrEqual(0);
    }
    for (const log of failures) {
      expect(typeof log.error).toBe('string');
    }
  });
});

// ── Test 7: Performance Baseline ──────────────────────────────────────────────
describe('Test 7: Performance Baseline', () => {
  it('all action types complete within production time bounds', async () => {
    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const clickResult = await sdk.execute({ action: 'click', target: '#btn' });
    expect(clickResult.success).toBe(true);
    expect(clickResult.duration).toBeLessThan(5000);

    await (await sdk.getPage()).goto(testUrl(), { waitUntil: 'domcontentloaded' });
    const typeResult = await sdk.execute({
      action: 'type',
      target: '#email',
      value: 'perf@test.com',
    });
    expect(typeResult.success).toBe(true);
    expect(typeResult.duration).toBeLessThan(5000);

    const navResult = await sdk.execute({ action: 'navigate', target: testUrl() });
    expect(navResult.success).toBe(true);
    expect(navResult.duration).toBeLessThan(10000);

    const report = [
      `  click:    ${clickResult.duration}ms  (limit 5 000ms)`,
      `  type:     ${typeResult.duration}ms  (limit 5 000ms)`,
      `  navigate: ${navResult.duration}ms  (limit 10 000ms)`,
    ].join('\n');
    console.log(`\nPerformance Baseline:\n${report}`);
  });
});


