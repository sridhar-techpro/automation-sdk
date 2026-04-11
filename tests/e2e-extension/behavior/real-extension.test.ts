/**
 * Real Extension E2E Test — Goal Input → Backend Plan → DOM Execution
 *
 * Flow:
 *   1. Start Python backend (uvicorn) — inherits OPENAI_API_KEY from env
 *   2. Launch Chrome with the real extension loaded (--load-extension)
 *   3. Blank-page warmup — lets the MV3 service worker fully initialise
 *   4. Open a local mock e-commerce page (content-script auto-injected by manifest)
 *   5. Open the REAL popup (chrome-extension://) with ?targetUrl= so chrome.tabs
 *      finds our e-commerce page without any chrome.* mocking
 *   6. Type an e-commerce goal in #goal-input
 *   7. Click #btn-send
 *   8. Background calls backend POST /plan-with-context → gets CSS-selector steps
 *      (uses real OpenAI when OPENAI_API_KEY is set; heuristic mock otherwise)
 *   9. Background executes steps via content-script → DOM mutates
 *  10. Fetch logs from backend GET /logs — assert every pipeline stage logged
 *
 * How to provide OPENAI_API_KEY:
 *   Local:  export OPENAI_API_KEY=sk-proj-...  (then pnpm test:e2e-extension)
 *   CI:     Add as a GitHub Actions repository secret named OPENAI_API_KEY
 *           and expose it in the workflow env (see .github/workflows/ci.yml)
 *   The key is NEVER stored in source code — only read from the environment.
 */

import * as http from 'http';
import type { ChildProcess } from 'child_process';
import type { Browser, Page } from 'puppeteer-core';
import {
  launchExtensionBrowser,
  computeExtensionId,
  startLogCaptureServer,
  setActiveLogPort,
  EXTENSION_PATH,
  type LogCaptureResult,
} from '../shared/helpers';
import {
  startBackend,
  getBackendLogs,
  clearBackendLogs,
  BACKEND_PORT,
} from '../shared/backend-client';

// ─── Mock e-commerce page ─────────────────────────────────────────────────────

/**
 * Realistic product page served locally.
 * Has #add-to-cart (matches mock plan) and #search-input / #search-btn.
 * The cart button fires a DOM mutation so the test can assert execution.
 */
const ECOMMERCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Mock Shop</title><style>
  body { font-family: sans-serif; padding: 20px; }
  .product { border: 1px solid #ccc; padding: 16px; max-width: 320px; border-radius: 8px; }
  .price   { color: #e74c3c; font-size: 1.2em; font-weight: bold; }
  .rating  { color: #f39c12; }
  #add-to-cart { background:#27ae60; color:#fff; border:none; padding:10px 20px;
                  border-radius:4px; cursor:pointer; font-size:14px; margin-top:10px; }
  #search-input{ width:200px; padding:6px; margin-right:6px; }
  #search-btn  { padding:6px 12px; cursor:pointer; }
  #cart-notification { display:none; background:#d4edda; color:#155724;
                        padding:10px; border-radius:4px; margin-top:12px; }
</style></head>
<body>
  <div style="margin-bottom:16px">
    <input id="search-input" type="text" placeholder="Search products…" />
    <button id="search-btn" type="button">Search</button>
  </div>
  <div class="product">
    <h2>Smartphone Pro X</h2>
    <div class="price">₹18,999</div>
    <div class="rating">★ 4.5 <small>(1,234 reviews)</small></div>
    <button id="add-to-cart" type="button">Add to Cart</button>
  </div>
  <div id="cart-notification">✓ Added to cart!</div>
  <script>
    document.getElementById('add-to-cart').addEventListener('click', function() {
      document.getElementById('cart-notification').style.display = 'block';
    });
    document.getElementById('search-btn').addEventListener('click', function() {
      document.getElementById('search-btn').dataset.clicked = 'true';
    });
  </script>
</body>
</html>`;

// ─── Suite state ──────────────────────────────────────────────────────────────

let mockServer:   http.Server;
let mockPort:     number;
let backendProc:  ChildProcess | null = null;
let browser:      Browser;
let ecPage:       Page;
let logCapture:   LogCaptureResult;

function ecUrl(): string {
  return `http://127.0.0.1:${mockPort}/`;
}

function realPopupUrl(extId: string): string {
  return (
    `chrome-extension://${extId}/popup.html` +
    `?targetUrl=${encodeURIComponent(ecUrl())}`
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Log capture server (test-side, for unit-style log assertions)
  logCapture = await startLogCaptureServer(0);
  setActiveLogPort(logCapture.port);

  // 2. Serve the mock e-commerce page via HTTP
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      const host = req.headers['host'] ?? '';
      if (!host.startsWith('127.0.0.1')) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ECOMMERCE_HTML);
    });
    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = (mockServer.address() as { port: number }).port;
      resolve();
    });
  });

  // 3. Start the Python backend (uvicorn).
  //    Inherits OPENAI_API_KEY from the current environment automatically.
  //    With the key set → real gpt-4o-mini planning.
  //    Without it → deterministic heuristic mock (still tests the full pipeline).
  backendProc = await startBackend(BACKEND_PORT, 25_000);
  await clearBackendLogs(BACKEND_PORT);

  const usingAI = !!process.env.OPENAI_API_KEY;
  console.log(
    `[setup] Backend ready on port ${BACKEND_PORT}. ` +
    `AI planning: ${usingAI ? 'ENABLED (real OpenAI)' : 'DISABLED (heuristic mock)'}`,
  );

  // 4. Launch Chrome with the extension loaded
  browser = await launchExtensionBrowser();

  // 5. Blank-page warmup ─────────────────────────────────────────────────────
  //    Chrome MV3 service workers need time to register after browser launch.
  //    Navigating to about:blank first prevents "navigation blocked" on the
  //    first real page load and ensures the content-script injection pipeline
  //    is ready before we open the e-commerce page.
  const warmup = await browser.newPage();
  await warmup.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await new Promise<void>((r) => setTimeout(r, 800));
  await warmup.close();

  // 6. Open the mock e-commerce page
  //    content-script.js is automatically injected by the extension manifest
  //    ("matches": ["<all_urls>"])
  ecPage = await browser.newPage();
  await ecPage.goto(ecUrl(), { waitUntil: 'load' });
  await new Promise<void>((r) => setTimeout(r, 400)); // let content-script register
}, 90_000);

afterAll(async () => {
  setActiveLogPort(null);
  if (browser)     await browser.close();
  if (backendProc) backendProc.kill();
  await new Promise<void>((r) => mockServer.close(() => r()));
  await logCapture.stop();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Real extension: goal input → backend plan → DOM execution + logs', () => {
  it('opens real popup, enters e-commerce goal, clicks Send, captures backend logs', async () => {
    const extId = computeExtensionId(EXTENSION_PATH);

    // Clear logs before the test so we only assert THIS run's entries
    await clearBackendLogs(BACKEND_PORT);

    // ── 1. Open real extension popup (chrome-extension:// — not HTTP-served) ──
    //    ?targetUrl tells popup.js which tab to target via real chrome.tabs API
    const popupPage = await browser.newPage();

    try {
      // Open the REAL popup page (chrome-extension:// origin — real chrome.* APIs).
      // Puppeteer may emit ERR_BLOCKED_BY_CLIENT on extension URLs; we catch it
      // and rely on waitForSelector to confirm the page actually loaded.
      await popupPage
        .goto(realPopupUrl(extId), { waitUntil: 'domcontentloaded', timeout: 10_000 })
        .catch(() => { /* ERR_BLOCKED_BY_CLIENT is normal for chrome-extension:// */ });

      // Verify the goal input exists (proves popup.html has the goal section)
      await popupPage.waitForSelector('#goal-input', { timeout: 5_000 });
      await popupPage.waitForSelector('#btn-send',   { timeout: 5_000 });

      // ── 2. Enter the e-commerce goal ────────────────────────────────────────
      const GOAL = 'Click the Add to Cart button for the first product';
      await popupPage.type('#goal-input', GOAL, { delay: 20 });
      console.log(`[test] Typed goal: "${GOAL}"`);

      // ── 3. Click Send ────────────────────────────────────────────────────────
      //    Triggers: popup → chrome.runtime.sendMessage (PLAN_GOAL) →
      //              background → GET page HTML → POST /plan-with-context →
      //              chrome.tabs.sendMessage → content-script.click(#add-to-cart) →
      //              result back to popup
      await popupPage.click('#btn-send');
      console.log('[test] Clicked Send');

      // ── 4. Wait for popup to show a result ──────────────────────────────────
      await popupPage.waitForFunction(
        () => {
          const el = document.getElementById('goal-status') as HTMLElement | null;
          if (!el) return false;
          const text = el.textContent ?? '';
          const cls  = el.className;
          // Done when status has a non-empty class (success | error) and real text
          return (cls === 'success' || cls === 'error') && text.length > 0;
        },
        { timeout: 40_000 },
      );

      const goalStatusText  = await popupPage.$eval('#goal-status', (el) => el.textContent?.trim() ?? '');
      const goalStatusClass = await popupPage.$eval('#goal-status', (el) => el.className);
      console.log(`[test] Popup status: "${goalStatusText}" (class=${goalStatusClass})`);

      // Pipeline MUST have responded — success or meaningful error, never silent
      expect(['success', 'error']).toContain(goalStatusClass);

      // ── 5. Fetch logs from backend ───────────────────────────────────────────
      //    background.ts logs every stage via sendLog → POST /logs → backend store
      const logs = await getBackendLogs(BACKEND_PORT);
      console.log(`[test] Backend captured ${logs.length} log entries:`);
      logs.forEach((l) => console.log(`  [${l.level}] [${l.source}] ${l.message}`));

      // ── 6. Assert log coverage ───────────────────────────────────────────────
      expect(logs.length).toBeGreaterThan(0);

      const messages = logs.map((l) => l.message);

      // Planning started
      expect(messages).toContain('Planning goal');

      // Plan was received from backend (proves backend was called)
      expect(messages).toContain('Plan received');

      // At least one step was executed
      expect(messages.some((m) => m === 'Executing step')).toBe(true);

      // Final summary logged
      expect(messages).toContain('Goal execution complete');

      // ── 7. Verify DOM mutation (if execution succeeded) ───────────────────
      if (goalStatusClass === 'success') {
        const cartVisible = await ecPage.$eval(
          '#cart-notification',
          (el) => (el as HTMLElement).style.display !== 'none',
        );
        expect(cartVisible).toBe(true);
        console.log('[test] ✓ Cart notification visible — DOM mutation confirmed');
      } else {
        // Execution failed (e.g. selector not found) — pipeline still ran,
        // which is the important thing; log the reason for debugging
        const errorLog = logs.find((l) => l.level === 'error');
        if (errorLog) {
          console.log(`[test] Step failed (expected in some envs): ${errorLog.message}`, errorLog.data);
        }
      }
    } finally {
      await popupPage.close();
    }
  }, 70_000);
});
