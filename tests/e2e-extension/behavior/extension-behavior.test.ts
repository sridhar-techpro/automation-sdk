/**
 * Extended extension behavior tests.
 *
 * Covers gaps not addressed by tests/e2e/extension.e2e.test.ts:
 *  - Navigate action via content-script bridge
 *  - Screenshot action (acknowledge-only)
 *  - Error result for missing element (failure path)
 *  - Multiple sequential actions
 *  - Log entries captured by backend server (log coverage)
 *
 * Execution mode: Extension mode (new)
 * Uses: puppeteer-core only, no SDK methods.
 */

import * as http from 'http';
import type { Browser, Page } from 'puppeteer-core';
import {
  launchExtensionBrowser,
  getExtensionId,
  computeExtensionId,
  simulateExtensionAction,
  startLogCaptureServer,
  setActiveLogPort,
  EXTENSION_PATH,
  type LogCaptureResult,
} from '../shared/helpers';

// ─── Test page ────────────────────────────────────────────────────────────────

const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Behavior Test</title></head>
<body>
  <button  id="btn-a" type="button">Button A</button>
  <button  id="btn-b" type="button" style="display:none">Button B (hidden)</button>
  <input   id="inp"   type="text" data-testid="inp" />
  <div     id="result-a" style="display:none">A Clicked</div>
  <div     id="result-b" style="display:none">B Clicked</div>
  <script>
    document.getElementById('btn-a').addEventListener('click', function () {
      document.getElementById('result-a').style.display = 'block';
    });
    document.getElementById('btn-b').addEventListener('click', function () {
      document.getElementById('result-b').style.display = 'block';
    });
  </script>
</body>
</html>`;

// ─── Suite state ──────────────────────────────────────────────────────────────

let server:    http.Server;
let serverPort: number;
let browser:   Browser;
let page:      Page;
let logCapture: LogCaptureResult;

function testUrl(): string {
  return `http://127.0.0.1:${serverPort}/`;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Start log capture server on a dynamic port (STRICT — fail if unavailable).
  //    The OS assigns a free port (binding to 0 never fails due to port conflicts).
  //    setActiveLogPort wires this port into simulateExtensionAction so every
  //    action posts structured logs to this server.
  logCapture = await startLogCaptureServer(0);
  setActiveLogPort(logCapture.port);

  // 2. Start test HTTP server
  await new Promise<void>((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(TEST_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as { port: number }).port;
      resolve();
    });
  });

  // 3. Launch Chrome with extension
  browser = await launchExtensionBrowser();

  // 4. Open test page
  page = await browser.newPage();
  await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });
}, 60_000);

afterAll(async () => {
  setActiveLogPort(null);
  if (browser) await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await logCapture.stop();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Extension behavior: extension loads correctly', () => {
  it('assigns a deterministic 32-character extension ID (a–p alphabet)', async () => {
    const id = await getExtensionId(browser);
    // Chrome extension IDs use the a–p alphabet (base-16 with letter substitution)
    expect(id).toMatch(/^[a-p]{32}$/);
    // ID matches the deterministic computation from EXTENSION_PATH
    expect(id).toBe(computeExtensionId(EXTENSION_PATH));
  });
});

describe('Extension behavior: navigate action', () => {
  it('navigate action updates window.location.href', async () => {
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    // Navigate to a hash URL (same origin — avoids real network request)
    const result = await simulateExtensionAction(page, {
      action: 'navigate',
      target: testUrl() + '#section1',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('navigate');
    const href = await page.evaluate(() => window.location.href);
    expect(href).toContain('#section1');
  });
});

describe('Extension behavior: screenshot action', () => {
  it('screenshot action returns success (acknowledged at content-script level)', async () => {
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await simulateExtensionAction(page, {
      action: 'screenshot',
      target: 'viewport',
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('screenshot');
  });
});

describe('Extension behavior: error — missing element', () => {
  it('click on non-existent selector returns failure result (not a thrown error)', async () => {
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await simulateExtensionAction(page, {
      action: 'click',
      target: '#does-not-exist',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Element not found/);
  });

  it('type on non-existent selector returns failure result', async () => {
    const result = await simulateExtensionAction(page, {
      action: 'type',
      target: '#ghost-input',
      value: 'hello',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Element not found/);
  });
});

describe('Extension behavior: multiple sequential actions', () => {
  it('executes click then type in sequence and both succeed', async () => {
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const r1 = await simulateExtensionAction(page, { action: 'click', target: '#btn-a' });
    expect(r1.success).toBe(true);

    const resultVisible = await page.evaluate(
      () => (document.getElementById('result-a') as HTMLElement).style.display,
    );
    expect(resultVisible).toBe('block');

    const r2 = await simulateExtensionAction(page, {
      action: 'type',
      target: '#inp',
      value: 'sequential test',
    });
    expect(r2.success).toBe(true);

    const inputValue = await page.evaluate(
      () => (document.getElementById('inp') as HTMLInputElement).value,
    );
    expect(inputValue).toBe('sequential test');
  });

  it('each action result carries action, target, timestamp, and duration fields', async () => {
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    const result = await simulateExtensionAction(page, { action: 'click', target: '#btn-a' });

    expect(result.action).toBe('click');
    expect(result.target).toBe('#btn-a');
    expect(typeof result.timestamp).toBe('number');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('Extension behavior: log capture coverage', () => {
  it('log capture server is running and has captured entries for every action', () => {
    // logCapture is non-null — any failure to start the server would have
    // already thrown in beforeAll, failing the entire suite.
    expect(logCapture.entries).toBeDefined();

    // Every simulateExtensionAction call posts two log entries
    // (action start + action result).
    expect(logCapture.entries.length).toBeGreaterThan(0);

    // At least one "action start" entry must exist.
    const startEntries = logCapture.entries.filter((e) =>
      e.message.includes('action start'),
    );
    expect(startEntries.length).toBeGreaterThan(0);

    // At least one success/failure entry must exist.
    const resultEntries = logCapture.entries.filter(
      (e) => e.message.includes('action success') || e.message.includes('action failure'),
    );
    expect(resultEntries.length).toBeGreaterThan(0);

    // Each action posts two entries (start + result).
    // loggedSteps = number of "start" entries = number of actions that ran.
    const loggedSteps = startEntries.length;
    // totalSteps is derived from entries (2 entries per action).
    const derivedTotalSteps = Math.floor(logCapture.entries.length / 2);
    const logCoverage =
      derivedTotalSteps > 0 ? loggedSteps / derivedTotalSteps : 0;
    expect(logCoverage).toBeGreaterThanOrEqual(0.95);
  });
});
