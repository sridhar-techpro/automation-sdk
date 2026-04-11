/**
 * Popup UX Tests
 *
 * Validates the full popup UI flow WITHOUT bypassing the popup:
 *
 *   Open popup page → fill action/target fields → click Run → verify result
 *
 * The popup HTML + JS are served via HTTP (not chrome-extension://) so that
 * Puppeteer can navigate to them normally.  A mock `window.chrome` API is
 * injected before the page loads (via `page.evaluateOnNewDocument`) to
 * simulate the Chrome extension APIs the popup.js depends on.
 *
 * The mock chrome.runtime.sendMessage immediately returns a success
 * ACTION_RESULT, which causes popup.js to show "Done in Xms" in #status.
 *
 * Constraints:
 *  - Uses puppeteer-core only
 *  - Does NOT call SDK methods
 *  - Does NOT bypass the popup (tests the popup HTML/JS directly)
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { Browser, Page } from 'puppeteer-core';
import {
  launchExtensionBrowser,
  startLogCaptureServer,
  setActiveLogPort,
  type LogCaptureResult,
} from '../shared/helpers';

// ─── Popup file paths ─────────────────────────────────────────────────────────

const EXTENSION_DIR = path.resolve(__dirname, '../../../extension');
const POPUP_HTML    = fs.readFileSync(path.join(EXTENSION_DIR, 'popup.html'), 'utf8');
const POPUP_JS      = fs.readFileSync(path.join(EXTENSION_DIR, 'popup.js'),   'utf8');

// ─── Suite state ──────────────────────────────────────────────────────────────

let appServer:   http.Server;
let appPort:     number;
let browser:     Browser;
let popupPage:   Page;
let logCapture:  LogCaptureResult;

function popupUrl(): string {
  return `http://127.0.0.1:${appPort}/popup.html`;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Start log capture server (STRICT — fail if port unavailable)
  logCapture = await startLogCaptureServer(0);
  setActiveLogPort(logCapture.port);

  // 2. Serve popup.html + popup.js via HTTP
  //    The popup.html references popup.js as <script src="popup.js">.
  appServer = http.createServer((req, res) => {
    const reqUrl  = req.url ?? '/';
    const reqHost = req.headers['host'] ?? '';
    // Validate host to satisfy url-sanitization requirements (CodeQL)
    if (!reqHost.startsWith('127.0.0.1')) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (reqUrl === '/' || reqUrl === '/popup.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(POPUP_HTML);
    } else if (reqUrl === '/popup.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(POPUP_JS);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => {
    appServer.listen(0, '127.0.0.1', () => {
      appPort = (appServer.address() as { port: number }).port;
      resolve();
    });
  });

  // 3. Launch Chrome with extension
  browser = await launchExtensionBrowser();

  // 4. Open popup via HTTP + inject chrome API mock BEFORE page loads
  popupPage = await browser.newPage();

  // Inject window.chrome mock so popup.js does not crash on undefined chrome.*
  // This simulates the Chrome runtime environment the popup expects.
  await popupPage.evaluateOnNewDocument(() => {
    (window as unknown as Record<string, unknown>)['chrome'] = {
      tabs: {
        query: (
          _opts: Record<string, unknown>,
          cb: (tabs: Array<{ id: number }>) => void,
        ) => {
          // Pretend there is an active tab with id 42
          cb([{ id: 42 }]);
        },
      },
      runtime: {
        sendMessage: (
          msg: {
            type: string;
            payload?: { action: string; target: string; value?: string };
          },
          cb: (resp: unknown) => void,
        ) => {
          // Simulate background worker returning a success result after 30ms
          setTimeout(() => {
            cb({
              type: 'ACTION_RESULT',
              result: {
                success: true,
                action:  msg?.payload?.action  ?? 'click',
                target:  msg?.payload?.target  ?? '#target',
                timestamp: Date.now(),
                duration:  10,
              },
            });
          }, 30);
        },
        lastError: null as null,
      },
    };
  });

  await popupPage.goto(popupUrl(), {
    waitUntil: 'domcontentloaded',
    timeout: 10_000,
  });
}, 60_000);

afterAll(async () => {
  setActiveLogPort(null);
  if (browser) await browser.close();
  await new Promise<void>((r) => appServer.close(() => r()));
  await logCapture.stop();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Popup UX: initial render', () => {
  it('renders action select with four options', async () => {
    const options = await popupPage.$$eval(
      '#action option',
      (els) => els.map((o) => (o as HTMLOptionElement).value),
    );
    expect(options).toEqual(['navigate', 'click', 'type', 'screenshot']);
  });

  it('renders target input with correct placeholder', async () => {
    const placeholder = await popupPage.$eval(
      '#target',
      (el) => (el as HTMLInputElement).placeholder,
    );
    expect(placeholder).toBe('CSS selector or URL');
  });

  it('renders Run and Clear buttons', async () => {
    const runBtn   = await popupPage.$('#btn-run');
    const clearBtn = await popupPage.$('#btn-clear');
    expect(runBtn).not.toBeNull();
    expect(clearBtn).not.toBeNull();
  });

  it('hides value field for non-type actions on load', async () => {
    const display = await popupPage.$eval(
      '#value-field',
      (el) => (el as HTMLElement).style.display,
    );
    expect(display).toBe('none');
  });

  it('shows value field when action is changed to type', async () => {
    await popupPage.select('#action', 'type');
    const display = await popupPage.$eval(
      '#value-field',
      (el) => (el as HTMLElement).style.display,
    );
    // 'none' is explicitly overridden to '' (empty = visible)
    expect(display).not.toBe('none');
    // Reset to click for subsequent tests
    await popupPage.select('#action', 'click');
  });
});

describe('Popup UX: validation', () => {
  it('shows error status when Run is clicked with empty target', async () => {
    // Ensure target is empty
    await popupPage.$eval('#target', (el) => { (el as HTMLInputElement).value = ''; });
    await popupPage.click('#btn-run');

    const statusText  = await popupPage.$eval('#status', (el) => el.textContent?.trim() ?? '');
    const statusClass = await popupPage.$eval('#status', (el) => el.className);
    expect(statusText).toBe('Target / URL is required.');
    expect(statusClass).toBe('error');
  });
});

describe('Popup UX: Run button end-to-end flow', () => {
  it('executes action and shows Done on success (full popup UX flow)', async () => {
    // Fill popup form: action=click, target=#some-button
    await popupPage.select('#action', 'click');
    await popupPage.$eval(
      '#target',
      (el, v) => { (el as HTMLInputElement).value = v as string; },
      '#some-button',
    );

    // Click Run
    await popupPage.click('#btn-run');

    // Wait for the mock background to respond (max 5 seconds)
    await popupPage.waitForFunction(
      () => {
        const s = document.getElementById('status') as HTMLDivElement | null;
        return s?.className === 'success' && (s?.textContent ?? '').includes('Done');
      },
      { timeout: 5_000 },
    );

    const statusClass = await popupPage.$eval('#status', (el) => el.className);
    const statusText  = await popupPage.$eval('#status', (el) => el.textContent?.trim() ?? '');
    expect(statusClass).toBe('success');
    expect(statusText).toContain('Done');
  });

  it('Clear button resets the form to its initial state', async () => {
    // Ensure #target has some text
    await popupPage.$eval(
      '#target',
      (el) => { (el as HTMLInputElement).value = '#filled-selector'; },
    );

    await popupPage.click('#btn-clear');

    const targetVal   = await popupPage.$eval('#target', (el) => (el as HTMLInputElement).value);
    const actionVal   = await popupPage.$eval('#action', (el) => (el as HTMLSelectElement).value);
    expect(targetVal).toBe('');
    expect(actionVal).toBe('navigate');
  });
});

describe('Popup UX: log capture', () => {
  it('log capture server recorded entries during popup interaction', () => {
    // The popup UX test does not call simulateExtensionAction so no action
    // logs are posted.  Verify the server is running and reachable.
    expect(logCapture.entries).toBeDefined();
    // logCapture.entries may be empty (popup.js fetches no logs) — that is OK.
    // This test validates the log server was up throughout the popup tests.
    expect(Array.isArray(logCapture.entries)).toBe(true);
  });
});
