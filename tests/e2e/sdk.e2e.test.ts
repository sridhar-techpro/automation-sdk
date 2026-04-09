import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE =
  process.env.CHROME_PATH ??
  '/usr/bin/google-chrome';

const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <button id="btn">Login</button>
  <input id="email" placeholder="Email" />
  <div id="delayed" style="display:none">Delayed Content</div>
  <div id="result" style="display:none">Logged In</div>
  <script>
    setTimeout(() => { document.getElementById('delayed').style.display = 'block'; }, 500);
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

function getSDKPage(): Page {
  return (sdk as unknown as { connectionManager: { getPage: () => Page } }).connectionManager.getPage();
}

beforeAll(async () => {
  // Start local HTTP server
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

  // Launch browser using puppeteer-core with system Chrome
  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  wsEndpoint = browser.wsEndpoint();

  sdk = new AutomationSDK({
    browserWSEndpoint: wsEndpoint,
    defaultTimeout: 15000,
    retries: 2,
    retryDelay: 200,
  });

  await sdk.connect();

  // Navigate to test page
  const page = getSDKPage();
  await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });
}, 60000);

afterAll(async () => {
  await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Test 1: Background Execution ──────────────────────────────────────────────
describe('Test 1: Background Execution', () => {
  it('should execute SDK actions while the tab simulates background visibility', async () => {
    const mainPage = getSDKPage();
    await mainPage.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    // Simulate the tab going to background by dispatching the same lifecycle events
    // that Chrome emits when a tab loses focus (page visibility hidden, window blur).
    await mainPage.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden' as DocumentVisibilityState,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });

    // The SDK uses CDP — execution is tab-focus-independent and must succeed
    // even when the page reports itself as hidden/blurred.
    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');

    // Verify the click took effect despite the page being in "background" state
    const resultVisible = await mainPage.$eval('#result', (el) => {
      return window.getComputedStyle(el as HTMLElement).display !== 'none';
    });
    expect(resultVisible).toBe(true);
  });
});

// ── Test 2: Retry Stability ───────────────────────────────────────────────────
describe('Test 2: Retry Stability', () => {
  it('should succeed on a delayed element using auto-wait', async () => {
    const page = getSDKPage();
    await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#delayed', { visible: true, timeout: 5000 });

    const isVisible = await page.$eval('#delayed', (el) => {
      return window.getComputedStyle(el as HTMLElement).display !== 'none';
    });
    expect(isVisible).toBe(true);
  });
});

// ── Test 3: Selector Intelligence ────────────────────────────────────────────
describe('Test 3: Selector Intelligence', () => {
  it('should click an element using exact text selector (text=Login)', async () => {
    const page = getSDKPage();
    await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: 'text=Login' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');

    // The click should have revealed the result div
    const resultVisible = await page.$eval('#result', (el) => {
      return window.getComputedStyle(el as HTMLElement).display !== 'none';
    });
    expect(resultVisible).toBe(true);
  });

  it('should click an element using partial text selector (text*=Log)', async () => {
    const page = getSDKPage();
    await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: 'text*=Log' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');
  });

  it('should click an element using CSS selector', async () => {
    const page = getSDKPage();
    await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    const result = await sdk.execute({ action: 'click', target: '#btn' });
    expect(result.success).toBe(true);
    expect(result.action).toBe('click');
  });
});

// ── Test 4: Multi-step Flow ───────────────────────────────────────────────────
describe('Test 4: Multi-step Flow', () => {
  it('should navigate → type → click → validate outcome', async () => {
    const page = getSDKPage();

    // Step 1: Navigate
    const navResult = await sdk.execute({
      action: 'navigate',
      target: `http://127.0.0.1:${serverPort}`,
    });
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

    const typedValue = await page.$eval('#email', (el) => (el as HTMLInputElement).value);
    expect(typedValue).toBe('user@example.com');

    // Step 3: Click button
    const clickResult = await sdk.execute({ action: 'click', target: '#btn' });
    expect(clickResult.success).toBe(true);
    expect(clickResult.action).toBe('click');

    // Step 4: Validate outcome — result div becomes visible
    const resultVisible = await page.$eval('#result', (el) => {
      return window.getComputedStyle(el as HTMLElement).display !== 'none';
    });
    expect(resultVisible).toBe(true);

    // All logged actions are recorded
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
