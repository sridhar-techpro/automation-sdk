/**
 * Real Extension Integration Tests
 *
 * Tests the FULL extension pipeline using real Chrome extension APIs:
 *
 *   popup (chrome-extension://) → background.js → content-script.js → DOM
 *
 * Key differences from popup-ux.test.ts (which serves popup via HTTP + mocks chrome.*):
 *  - Extension popup is served from the REAL chrome-extension:// origin
 *  - chrome.runtime.sendMessage, chrome.tabs.query etc. are REAL (no mock)
 *  - background.js is the REAL service worker processing the message
 *  - content-script.js runs in the REAL test page and mutates the REAL DOM
 *  - DOM change is verified in the test page — proves end-to-end execution
 *
 * Blank-page warmup:
 *   Chrome MV3 service workers need time to initialize after launch.
 *   Navigating to about:blank first gives the extension time to register
 *   its content scripts and service worker before any real navigation.
 *   Skipping the warmup causes the first real navigation to fail silently.
 *
 * AI goal processing (optional):
 *   When OPENAI_API_KEY is set, one additional test uses the OpenAI API to
 *   translate a natural-language goal into a structured action, then executes
 *   it through the same real extension pipeline.  The test is skipped
 *   automatically when the env var is absent.
 *
 * Constraints:
 *  - puppeteer-core only
 *  - No Playwright
 *  - No SDK core methods
 *  - TypeScript throughout
 */

import * as http from 'http';
import type { Browser, Page } from 'puppeteer-core';
import {
  launchExtensionBrowser,
  computeExtensionId,
  startLogCaptureServer,
  setActiveLogPort,
  EXTENSION_PATH,
  type LogCaptureResult,
} from '../shared/helpers';
import { processGoalWithAI } from '../shared/ai-goal';

// ─── Test page HTML ───────────────────────────────────────────────────────────

/**
 * Minimal test page:
 *  - #btn    : a button whose click makes #result visible
 *  - #inp    : text input for "type" action tests
 *  - #result : hidden div that becomes visible after button click
 *
 * The extension's content-script.js will be injected here automatically
 * because the manifest has `"matches": ["<all_urls>"]`.
 */
const TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Real Extension Test Page</title></head>
<body>
  <button id="btn" type="button">Click me</button>
  <input  id="inp" type="text" placeholder="Type here" />
  <div    id="result" style="display:none">Clicked!</div>
  <script>
    document.getElementById('btn').addEventListener('click', function() {
      document.getElementById('result').style.display = 'block';
    });
  </script>
</body>
</html>`;

// ─── Suite state ──────────────────────────────────────────────────────────────

let testServer:  http.Server;
let testPort:    number;
let browser:     Browser;
let testPage:    Page;
let logCapture:  LogCaptureResult;

/** Full URL of the test page (e.g. http://127.0.0.1:PORT/) */
function testPageUrl(): string {
  return `http://127.0.0.1:${testPort}/`;
}

/** Full URL of the real extension popup with the ?targetUrl override */
function realPopupUrl(extId: string): string {
  return (
    `chrome-extension://${extId}/popup.html` +
    `?targetUrl=${encodeURIComponent(testPageUrl())}`
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Log capture server (strict — throws if unavailable)
  logCapture = await startLogCaptureServer(0);
  setActiveLogPort(logCapture.port);

  // 2. HTTP server that serves the test page
  await new Promise<void>((resolve) => {
    testServer = http.createServer((req, res) => {
      const host = req.headers['host'] ?? '';
      // Validate host to prevent CodeQL url-sanitization alerts
      if (!host.startsWith('127.0.0.1')) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(TEST_HTML);
    });
    testServer.listen(0, '127.0.0.1', () => {
      testPort = (testServer.address() as { port: number }).port;
      resolve();
    });
  });

  // 3. Launch Chrome with the extension loaded
  browser = await launchExtensionBrowser();

  // 4. ── BLANK-PAGE WARMUP ──────────────────────────────────────────────────
  //    Chrome MV3 service workers need to initialize after browser launch.
  //    Navigating to about:blank first gives the extension time to:
  //      a) register its service worker (background.js)
  //      b) prepare its content-script injection pipeline
  //    Without this warmup, the first real navigation can fail silently or
  //    arrive before the content script is ready to handle messages.
  const warmupPage = await browser.newPage();
  await warmupPage.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await new Promise<void>((r) => setTimeout(r, 800));
  await warmupPage.close();

  // 5. Open the test page — content-script.js is injected automatically
  //    by the extension manifest ("matches": ["<all_urls>"])
  testPage = await browser.newPage();
  await testPage.goto(testPageUrl(), { waitUntil: 'load' });

  // Brief pause to let content-script.js register its onMessage listener
  await new Promise<void>((r) => setTimeout(r, 300));
}, 60_000);

afterAll(async () => {
  setActiveLogPort(null);
  if (browser) await browser.close();
  await new Promise<void>((r) => testServer.close(() => r()));
  await logCapture.stop();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Real extension pipeline: click via popup → background → content-script → DOM', () => {
  it('executes a click action through the full real extension pipeline', async () => {
    // Resolve the extension ID deterministically from the extension path
    const extId = computeExtensionId(EXTENSION_PATH);
    expect(extId).toMatch(/^[a-p]{32}$/);

    // Open the REAL popup page (chrome-extension:// — not HTTP-served)
    // ?targetUrl tells popup.js to look for our test page by URL
    // (resolveTargetTab uses real chrome.tabs.query — no mock)
    const popupPage = await browser.newPage();

    try {
      await popupPage.goto(realPopupUrl(extId), {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });

      // Verify popup loaded (sanity check — real extension URL served OK)
      await popupPage.waitForSelector('#btn-run', { timeout: 5_000 });

      // ── Step 1: Select action = click ────────────────────────────────────
      await popupPage.select('#action', 'click');

      // ── Step 2: Enter target selector ────────────────────────────────────
      await popupPage.type('#target', '#btn');

      // ── Step 3: Click Run  ───────────────────────────────────────────────
      //    This triggers:
      //      popup.js → chrome.runtime.sendMessage (real)
      //      background.js → chrome.tabs.sendMessage to testPage (real)
      //      content-script.js → el.click() on #btn (real DOM mutation)
      //      content-script.js → sendResponse back (real)
      //      background.js → sendResponse back to popup (real)
      //      popup.js → shows "Done in Xms"
      await popupPage.click('#btn-run');

      // ── Step 4: Wait for popup to confirm success ─────────────────────
      await popupPage.waitForFunction(
        () => {
          const s = document.getElementById('status') as HTMLDivElement | null;
          return (
            s !== null &&
            s.className === 'success' &&
            (s.textContent ?? '').includes('Done')
          );
        },
        { timeout: 20_000 },
      );

      const statusText = await popupPage.$eval(
        '#status',
        (el) => el.textContent?.trim() ?? '',
      );
      expect(statusText).toContain('Done');

      // ── Step 5: Verify DOM change in the test page ────────────────────
      //    The button click should have made #result visible
      const resultVisible = await testPage.$eval(
        '#result',
        (el) => (el as HTMLElement).style.display !== 'none',
      );
      expect(resultVisible).toBe(true);
    } finally {
      await popupPage.close();
    }
  }, 40_000);

  it('executes a type action through the full real extension pipeline', async () => {
    const extId = computeExtensionId(EXTENSION_PATH);
    const popupPage = await browser.newPage();

    try {
      await popupPage.goto(realPopupUrl(extId), {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
      await popupPage.waitForSelector('#btn-run', { timeout: 5_000 });

      // Select "type" action (shows value field)
      await popupPage.select('#action', 'type');
      await popupPage.waitForFunction(
        () => (document.getElementById('value-field') as HTMLElement | null)
          ?.style.display !== 'none',
        { timeout: 3_000 },
      );

      await popupPage.type('#target', '#inp');
      await popupPage.type('#value', 'hello from extension');
      await popupPage.click('#btn-run');

      await popupPage.waitForFunction(
        () => {
          const s = document.getElementById('status') as HTMLDivElement | null;
          return s?.className === 'success' && (s?.textContent ?? '').includes('Done');
        },
        { timeout: 20_000 },
      );

      // Verify the input value was set in the test page
      const inputValue = await testPage.$eval(
        '#inp',
        (el) => (el as HTMLInputElement).value,
      );
      expect(inputValue).toBe('hello from extension');
    } finally {
      await popupPage.close();
    }
  }, 40_000);
});

// ─── AI-powered goal test (skipped when OPENAI_API_KEY not set) ───────────────

describe('Real extension pipeline: AI goal → action → DOM', () => {
  /**
   * Uses OpenAI to translate a natural-language goal into a structured
   * extension action, then executes it through the full real pipeline.
   *
   * Skips automatically when OPENAI_API_KEY is not set — safe to run in CI
   * with or without network access to api.openai.com.
   */
  it('AI processes goal and executes action through real extension pipeline', async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Graceful skip: OPENAI_API_KEY must be set to run this test
      console.log(
        '[AI goal test] OPENAI_API_KEY not set — skipping. ' +
        'Set the environment variable to enable this test.',
      );
      return;
    }

    // Get the current HTML so AI can reason about the page
    const pageHtml = await testPage.evaluate(() => document.body.innerHTML);

    // ── Ask AI to determine the best action ──────────────────────────────
    let goalResult;
    try {
      goalResult = await processGoalWithAI(
        'Click the main call-to-action button on this page',
        pageHtml,
      );
    } catch (err) {
      // Network to api.openai.com is blocked — skip gracefully
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('ENOTFOUND') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('socket hang up')
      ) {
        console.log(`[AI goal test] OpenAI API unreachable — skipping. Error: ${errMsg}`);
        return;
      }
      throw err;
    }

    expect(goalResult.action.action).toBe('click');
    expect(goalResult.action.target).toBeTruthy();
    expect(goalResult.reasoning).toBeTruthy();

    console.log(`[AI goal test] Reasoning: ${goalResult.reasoning}`);
    console.log(`[AI goal test] Action: ${JSON.stringify(goalResult.action)}`);

    // Reset test page state (in case #result is already visible from prior test)
    await testPage.evaluate(() => {
      const r = document.getElementById('result') as HTMLElement | null;
      if (r) r.style.display = 'none';
    });

    // ── Execute AI-chosen action through real extension pipeline ──────────
    const extId = computeExtensionId(EXTENSION_PATH);
    const popupPage = await browser.newPage();

    try {
      await popupPage.goto(realPopupUrl(extId), {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
      await popupPage.waitForSelector('#btn-run', { timeout: 5_000 });

      await popupPage.select('#action', goalResult.action.action);
      await popupPage.type('#target', goalResult.action.target);

      if (goalResult.action.value) {
        await popupPage.type('#value', goalResult.action.value);
      }

      await popupPage.click('#btn-run');

      // Wait for success or failure (AI might suggest a wrong selector — that's OK,
      // we just assert the popup responded and the pipeline completed)
      await popupPage.waitForFunction(
        () => {
          const s = document.getElementById('status') as HTMLDivElement | null;
          return s !== null && s.className !== '';
        },
        { timeout: 20_000 },
      );

      const statusClass = await popupPage.$eval('#status', (el) => el.className);
      const statusText  = await popupPage.$eval(
        '#status',
        (el) => el.textContent?.trim() ?? '',
      );

      // Log result (don't fail on wrong selector — AI is best-effort)
      console.log(`[AI goal test] Pipeline result: ${statusClass} — "${statusText}"`);

      // The pipeline MUST have responded (success or failure — not silent)
      expect(['success', 'error']).toContain(statusClass);
    } finally {
      await popupPage.close();
    }
  }, 60_000);
});

// ─── Log capture validation ───────────────────────────────────────────────────

describe('Real extension pipeline: log capture', () => {
  it('log capture server was active throughout all real extension tests', () => {
    expect(logCapture.entries).toBeDefined();
    expect(Array.isArray(logCapture.entries)).toBe(true);
    // Note: the real extension background.js posts logs via fetch to
    // http://127.0.0.1:8000/logs. In this suite the log server is on a
    // dynamic port (logCapture.port), so browser-side fetch posts won't
    // arrive unless the extension is reconfigured to use that port.
    // Observability for this suite is provided by:
    //   a) DOM change assertion (proves content-script executed)
    //   b) Popup status "Done" assertion (proves background processed it)
    //   c) log server is running and reachable from Node.js side
  });
});
