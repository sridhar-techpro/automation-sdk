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
  <script>
    setTimeout(() => { document.getElementById('delayed').style.display = 'block'; }, 500);
  </script>
</body>
</html>`;

let server: http.Server;
let serverPort: number;
let browser: Browser;
let wsEndpoint: string;
let sdk: AutomationSDK;

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
  const page = (sdk as unknown as { connectionManager: { getPage: () => Page } }).connectionManager.getPage();
  await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });
}, 60000);

afterAll(async () => {
  await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('AutomationSDK E2E', () => {
  it('should click a button by CSS selector', async () => {
    const result = await sdk.execute({
      action: 'click',
      target: '#btn',
    });
    expect(result.action).toBe('click');
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('should type into an input field', async () => {
    const result = await sdk.execute({
      action: 'type',
      target: '#email',
      value: 'test@example.com',
    });
    expect(result.action).toBe('type');
    expect(result.success).toBe(true);

    const page = (sdk as unknown as { connectionManager: { getPage: () => Page } }).connectionManager.getPage();
    const value = await page.$eval('#email', (el) => (el as HTMLInputElement).value);
    expect(value).toBe('test@example.com');
  });

  it('should navigate to a URL', async () => {
    const result = await sdk.execute({
      action: 'navigate',
      target: `http://127.0.0.1:${serverPort}`,
    });
    expect(result.action).toBe('navigate');
    expect(result.success).toBe(true);
  });

  it('should wait for delayed element to appear', async () => {
    const page = (sdk as unknown as { connectionManager: { getPage: () => Page } }).connectionManager.getPage();
    await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('#delayed', { visible: true, timeout: 5000 });

    const isVisible = await page.$eval('#delayed', (el) => {
      return window.getComputedStyle(el as HTMLElement).display !== 'none';
    });
    expect(isVisible).toBe(true);
  });

  it('should log actions', async () => {
    const logs = sdk.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      expect(log).toHaveProperty('action');
      expect(log).toHaveProperty('success');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('duration');
    }
  });
});
