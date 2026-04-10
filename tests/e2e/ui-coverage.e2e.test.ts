/**
 * UI Coverage E2E — Universal interaction coverage.
 *
 * Proves the SDK works across:
 *   • multi-step form workflows
 *   • all major HTML element types (text, password, textarea, radio, checkbox,
 *     native select, custom div dropdown, button, div-as-button, anchor)
 *   • table rows and simulated pagination
 *   • dynamic / delayed DOM content  (auto-wait + retry)
 *   • iFrame elements
 *   • shadow DOM elements
 *   • resilient failure handling (missing element handled gracefully)
 *   • multi-tab management                 ← placed LAST
 *
 * Design constraints (same as sdk.e2e.test.ts / phase2.e2e.test.ts):
 *  — Never call browser.newPage() while the SDK is connected.
 *  — Never call page.bringToFront() in headless Chrome.
 *  — Let browser.close() in afterAll handle tab clean-up.
 *  — Use a local HTTP server; no real network requests needed.
 *  — All <button> elements carry type="button" to prevent accidental form
 *    re-submission on page reload.
 */

import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// ─── HTML fixtures ─────────────────────────────────────────────────────────────

/**
 * Main element-coverage page (served at every path except /form).
 *
 * Contains: text / password / textarea inputs, radio buttons, checkboxes,
 * native <select>, custom div-based dropdown, action button, div-as-button,
 * anchor link, employee table + pagination, a button that appears after 400 ms
 * (auto-wait probe), a disabled button enabled after 500 ms (retry probe),
 * an iFrame with an inner button, and a shadow DOM host.
 */
const MAIN_HTML = `<!DOCTYPE html>
<html>
<head><title>UI Coverage</title></head>
<body>

  <!-- ── Text Inputs ──────────────────────────────────────────────────── -->
  <label for="text-input">Full Name</label>
  <input id="text-input" type="text" placeholder="Full Name" />

  <label for="pass-input">Password</label>
  <input id="pass-input" type="password" placeholder="Password" />

  <label for="textarea">Comments</label>
  <textarea id="textarea" placeholder="Leave a comment"></textarea>

  <!-- ── Radio Buttons ────────────────────────────────────────────────── -->
  <input type="radio" name="gender" id="radio-male"   value="male"   />
  <label for="radio-male">Male</label>
  <input type="radio" name="gender" id="radio-female" value="female" />
  <label for="radio-female">Female</label>

  <!-- ── Checkboxes ───────────────────────────────────────────────────── -->
  <input type="checkbox" id="chk-sports"  /> <label for="chk-sports">Sports</label>
  <input type="checkbox" id="chk-music"   /> <label for="chk-music">Music</label>
  <input type="checkbox" id="chk-reading" /> <label for="chk-reading">Reading</label>

  <!-- ── Native Select ────────────────────────────────────────────────── -->
  <select id="native-select">
    <option value="">-- choose --</option>
    <option value="opt1">Option One</option>
    <option value="opt2">Option Two</option>
    <option value="opt3">Option Three</option>
  </select>

  <!-- ── Custom div-based Dropdown ────────────────────────────────────── -->
  <div id="custom-dropdown"
       role="combobox" aria-expanded="false" tabindex="0"
       style="display:inline-block;min-width:120px;border:1px solid #ccc;
              padding:4px;cursor:pointer">
    Select item...
  </div>
  <ul id="custom-dropdown-list" role="listbox"
      style="display:none;list-style:none;margin:0;padding:0;border:1px solid #ccc">
    <li class="dropdown-opt" data-value="alpha" tabindex="0">Alpha</li>
    <li class="dropdown-opt" data-value="beta"  tabindex="0">Beta</li>
    <li class="dropdown-opt" data-value="gamma" tabindex="0">Gamma</li>
  </ul>

  <!-- ── Interactive Elements ─────────────────────────────────────────── -->
  <button type="button" id="action-btn">Perform Action</button>
  <div id="div-btn" role="button" tabindex="0"
       style="display:inline-block;padding:4px 8px;border:1px solid #999;cursor:pointer">
    Div Button
  </div>
  <a id="link-anchor" href="#section-target">Go to Section</a>
  <div id="section-target" style="margin-top:500px">Target Section</div>

  <!-- ── Employee Table ───────────────────────────────────────────────── -->
  <table id="employee-table" border="1">
    <thead><tr><th>Name</th><th>Department</th></tr></thead>
    <tbody id="table-body">
      <tr class="emp-row" id="row-john">
        <td class="emp-name">John</td><td class="emp-dept">Engineering</td>
      </tr>
      <tr class="emp-row" id="row-jane">
        <td class="emp-name">Jane</td><td class="emp-dept">Marketing</td>
      </tr>
      <tr class="emp-row" id="row-bob">
        <td class="emp-name">Bob</td><td class="emp-dept">Sales</td>
      </tr>
    </tbody>
  </table>
  <button type="button" id="page-next-btn">Next Page</button>
  <span id="page-indicator">Page 1</span>

  <!-- ── Dynamic / Delayed Elements ──────────────────────────────────── -->
  <!-- Becomes visible 400 ms after page load — auto-wait probe -->
  <button type="button" id="dynamic-btn" style="display:none">Dynamic Button</button>
  <!-- Starts disabled; enabled 500 ms after page load — retry probe -->
  <button type="button" id="delayed-enable-btn" disabled>Delayed Enable</button>

  <!-- ── Status Display ───────────────────────────────────────────────── -->
  <div id="status" style="display:none" data-value=""></div>

  <!-- ── iFrame ───────────────────────────────────────────────────────── -->
  <iframe id="frame1" srcdoc="
    <!DOCTYPE html><html><body>
      <button type='button' id='iframe-btn'>iFrame Button</button>
      <div id='iframe-result' style='display:none'>iFrame OK</div>
      <script>
        document.getElementById('iframe-btn').addEventListener('click', function() {
          document.getElementById('iframe-result').style.display = 'block';
        });
      <\/script>
    </body></html>
  "></iframe>

  <!-- ── Shadow DOM host ──────────────────────────────────────────────── -->
  <div id="shadow-host"></div>

  <script>
    function showStatus(val) {
      var el = document.getElementById('status');
      el.style.display  = 'block';
      el.textContent    = val;
      el.dataset.value  = val;
    }

    // Action button
    document.getElementById('action-btn').addEventListener('click', function() {
      showStatus('action-btn-clicked');
    });

    // Div-as-button
    document.getElementById('div-btn').addEventListener('click', function() {
      showStatus('div-btn-clicked');
    });

    // Employee rows
    document.querySelectorAll('.emp-row').forEach(function(row) {
      row.addEventListener('click', function() {
        showStatus('row-' + row.querySelector('.emp-name').textContent.toLowerCase());
      });
    });

    // Pagination
    var currentPage = 1;
    document.getElementById('page-next-btn').addEventListener('click', function() {
      currentPage++;
      document.getElementById('page-indicator').textContent = 'Page ' + currentPage;
      showStatus('page-' + currentPage);
    });

    // Custom dropdown — toggle
    document.getElementById('custom-dropdown').addEventListener('click', function() {
      var list = document.getElementById('custom-dropdown-list');
      var nowOpen = list.style.display === 'none';
      list.style.display = nowOpen ? 'block' : 'none';
      this.setAttribute('aria-expanded', String(nowOpen));
    });

    // Custom dropdown — select option
    document.querySelectorAll('.dropdown-opt').forEach(function(opt) {
      opt.addEventListener('click', function() {
        document.getElementById('custom-dropdown').textContent = this.textContent;
        document.getElementById('custom-dropdown-list').style.display = 'none';
        document.getElementById('custom-dropdown').setAttribute('aria-expanded', 'false');
        showStatus('dropdown-' + this.dataset.value);
      });
    });

    // Dynamic button — becomes visible after 400 ms
    setTimeout(function() {
      document.getElementById('dynamic-btn').style.display = 'inline-block';
    }, 400);
    document.getElementById('dynamic-btn').addEventListener('click', function() {
      showStatus('dynamic-clicked');
    });

    // Delayed-enable button — enabled after 500 ms
    setTimeout(function() {
      document.getElementById('delayed-enable-btn').disabled = false;
    }, 500);
    document.getElementById('delayed-enable-btn').addEventListener('click', function() {
      showStatus('delayed-btn-clicked');
    });

    // Shadow DOM
    var host   = document.getElementById('shadow-host');
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<button type="button" id="shadow-btn" style="padding:4px 8px">Shadow Button</button>' +
      '<div id="shadow-result" style="display:none">Shadow OK</div>';
    shadow.getElementById('shadow-btn').addEventListener('click', function() {
      shadow.getElementById('shadow-result').style.display = 'block';
    });
  </script>
</body>
</html>`;

/**
 * Multi-step form page (served at /form).
 * Three-step wizard: name → email → confirm + submit.
 */
const FORM_HTML = `<!DOCTYPE html>
<html>
<head><title>Multi-Step Form</title></head>
<body>
  <div id="step-1">
    <h2>Step 1 — Your Name</h2>
    <label for="f-name">Name</label>
    <input id="f-name" type="text" placeholder="Enter your name" />
    <button type="button" id="step1-next">Next</button>
  </div>

  <div id="step-2" style="display:none">
    <h2>Step 2 — Your Email</h2>
    <label for="f-email">Email</label>
    <input id="f-email" type="email" placeholder="Enter your email" />
    <button type="button" id="step2-next">Next</button>
  </div>

  <div id="step-3" style="display:none">
    <h2>Step 3 — Confirm</h2>
    <p id="confirm-msg"></p>
    <button type="button" id="step3-submit">Submit</button>
  </div>

  <div id="form-success" style="display:none">
    <h2>Form Submitted Successfully</h2>
    <div id="submitted-data"></div>
  </div>

  <script>
    document.getElementById('step1-next').addEventListener('click', function() {
      var name = document.getElementById('f-name').value.trim();
      if (!name) return;
      document.getElementById('step-1').style.display = 'none';
      document.getElementById('step-2').style.display = 'block';
    });

    document.getElementById('step2-next').addEventListener('click', function() {
      var email = document.getElementById('f-email').value.trim();
      if (!email) return;
      var name = document.getElementById('f-name').value.trim();
      document.getElementById('confirm-msg').textContent = name + ' — ' + email;
      document.getElementById('step-2').style.display = 'none';
      document.getElementById('step-3').style.display = 'block';
    });

    document.getElementById('step3-submit').addEventListener('click', function() {
      var name  = document.getElementById('f-name').value.trim();
      var email = document.getElementById('f-email').value.trim();
      document.getElementById('step-3').style.display      = 'none';
      document.getElementById('form-success').style.display = 'block';
      document.getElementById('submitted-data').textContent = name + ' | ' + email;
    });
  </script>
</body>
</html>`;

// ─── Suite-level shared state ─────────────────────────────────────────────────

let server:     http.Server;
let serverPort: number;
let browser:    Browser;
let sdk:        AutomationSDK;

function urlFor(path: string): string {
  return `http://127.0.0.1:${serverPort}${path}`;
}

async function navigateToMain(): Promise<void> {
  const page = await sdk.getPage();
  await page.goto(urlFor('/'), { waitUntil: 'domcontentloaded' });
}

async function navigateToForm(): Promise<void> {
  const page = await sdk.getPage();
  await page.goto(urlFor('/form'), { waitUntil: 'domcontentloaded' });
}

beforeAll(async () => {
  // ── 1. Start HTTP server ──────────────────────────────────────────────────
  await new Promise<void>((resolve) => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (req.url === '/form') {
        res.end(FORM_HTML);
      } else {
        res.end(MAIN_HTML);
      }
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
    args: ['--no-sandbox', '--disable-setuid-sandbox',
           '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // ── 3. Connect SDK ────────────────────────────────────────────────────────
  sdk = new AutomationSDK({
    browserWSEndpoint: browser.wsEndpoint(),
    defaultTimeout: 10000,
    retries: 2,
    retryDelay: 200,
  });
  await sdk.connect();
  await navigateToMain();
}, 60000);

afterAll(async () => {
  await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Part 1: Multi-step form ──────────────────────────────────────────────────

describe('UI Coverage — Multi-step Form', () => {
  beforeEach(navigateToForm);

  it('navigates to step 2 when name is typed and Next is clicked', async () => {
    await sdk.locator('#f-name').type('Alice');
    await sdk.locator('#step1-next').click();

    const page = await sdk.getPage();
    const step2Visible = await page.$eval(
      '#step-2',
      (el) => (el as HTMLElement).style.display !== 'none',
    );
    expect(step2Visible).toBe(true);
  });

  it('completes all three steps and shows the success message', async () => {
    await sdk.locator('#f-name').type('Alice');
    await sdk.locator('#step1-next').click();

    await sdk.locator('#f-email').type('alice@example.com');
    await sdk.locator('#step2-next').click();

    await sdk.locator('#step3-submit').click();

    const page = await sdk.getPage();
    const successVisible = await page.$eval(
      '#form-success',
      (el) => (el as HTMLElement).style.display !== 'none',
    );
    expect(successVisible).toBe(true);

    const submittedText = await page.$eval(
      '#submitted-data',
      (el) => (el as HTMLElement).textContent,
    );
    expect(submittedText).toContain('Alice');
    expect(submittedText).toContain('alice@example.com');
  });
});

// ─── Part 2: Input elements ───────────────────────────────────────────────────

describe('UI Coverage — Input Elements', () => {
  beforeEach(navigateToMain);

  it('types into a text input', async () => {
    await sdk.locator('#text-input').type('Hello World');
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#text-input',
      (el) => (el as HTMLInputElement).value,
    );
    expect(value).toBe('Hello World');
  });

  it('types into a password input', async () => {
    await sdk.locator('#pass-input').type('s3cr3t!');
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#pass-input',
      (el) => (el as HTMLInputElement).value,
    );
    expect(value).toBe('s3cr3t!');
  });

  it('types into a textarea', async () => {
    await sdk.locator('#textarea').type('Test comment text');
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#textarea',
      (el) => (el as HTMLTextAreaElement).value,
    );
    expect(value).toBe('Test comment text');
  });
});

// ─── Part 3: Selection elements ───────────────────────────────────────────────

describe('UI Coverage — Selection Elements', () => {
  beforeEach(navigateToMain);

  it('selects a radio button by clicking the input element', async () => {
    await sdk.locator('#radio-male').click();
    const page = await sdk.getPage();
    const checked = await page.$eval(
      '#radio-male',
      (el) => (el as HTMLInputElement).checked,
    );
    expect(checked).toBe(true);
  });

  it('checks two checkboxes independently, leaving a third unchecked', async () => {
    await sdk.locator('#chk-sports').click();
    await sdk.locator('#chk-reading').click();

    const page = await sdk.getPage();
    const sports  = await page.$eval('#chk-sports',  (el) => (el as HTMLInputElement).checked);
    const music   = await page.$eval('#chk-music',   (el) => (el as HTMLInputElement).checked);
    const reading = await page.$eval('#chk-reading', (el) => (el as HTMLInputElement).checked);

    expect(sports).toBe(true);
    expect(music).toBe(false);     // never clicked
    expect(reading).toBe(true);
  });
});

// ─── Part 4: Dropdown elements ────────────────────────────────────────────────

describe('UI Coverage — Dropdown Elements', () => {
  beforeEach(navigateToMain);

  it('selects an option from a native <select> via page.select()', async () => {
    const page = await sdk.getPage();
    await page.select('#native-select', 'opt2');
    const value = await page.$eval(
      '#native-select',
      (el) => (el as HTMLSelectElement).value,
    );
    expect(value).toBe('opt2');
  });

  it('opens a custom div dropdown and selects an option by clicking', async () => {
    // Step 1 — open the dropdown
    await sdk.locator('#custom-dropdown').click();

    // Step 2 — select the "Beta" option using an attribute CSS selector
    await sdk.locator('.dropdown-opt[data-value="beta"]').click();

    const page = await sdk.getPage();
    const statusValue = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(statusValue).toBe('dropdown-beta');
  });
});

// ─── Part 5: Interactive elements ─────────────────────────────────────────────

describe('UI Coverage — Interactive Elements', () => {
  beforeEach(navigateToMain);

  it('clicks a standard <button> and verifies the outcome', async () => {
    await sdk.locator('#action-btn').click();
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(value).toBe('action-btn-clicked');
  });

  it('clicks a <div role="button"> element', async () => {
    await sdk.locator('#div-btn').click();
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(value).toBe('div-btn-clicked');
  });

  it('navigates via an <a> anchor link (in-page hash)', async () => {
    await sdk.locator('#link-anchor').click();
    const page = await sdk.getPage();
    // Read href directly from the browser's JS context.  page.url() can lag
    // behind synchronous hash-navigation because Puppeteer's internal URL
    // cache is updated asynchronously via the Target.targetInfoChanged event,
    // whereas window.location.href always reflects the current state.
    const href = await page.evaluate(() => window.location.href);
    expect(href).toContain('#section-target');
  });
});

// ─── Part 6: Table and pagination ─────────────────────────────────────────────

describe('UI Coverage — Table and Pagination', () => {
  beforeEach(navigateToMain);

  it('finds an employee row by text and clicks it', async () => {
    // text= uses exact-text matching; the <td>John</td> node matches.
    // The click bubbles to the <tr class="emp-row"> listener.
    await sdk.locator('text=John').click();
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(value).toBe('row-john');
  });

  it('simulates pagination by clicking Next Page', async () => {
    await sdk.locator('#page-next-btn').click();
    const page = await sdk.getPage();
    const indicatorText = await page.$eval(
      '#page-indicator',
      (el) => (el as HTMLElement).textContent,
    );
    expect(indicatorText).toBe('Page 2');
  });
});

// ─── Part 7: Dynamic content ──────────────────────────────────────────────────

describe('UI Coverage — Dynamic Content', () => {
  // Fresh page load for each test so timers start from zero.
  beforeEach(navigateToMain);

  it('auto-waits for a delayed element to become visible, then clicks it', async () => {
    // #dynamic-btn starts with display:none, appears after 400 ms.
    // The locator's withRetry loop re-checks actionability on each attempt
    // and succeeds once the element becomes visible.
    await sdk.locator('#dynamic-btn').click();
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(value).toBe('dynamic-clicked');
  });

  it('retries and succeeds on a button that starts disabled', async () => {
    // #delayed-enable-btn is disabled at page load; enabled after 500 ms.
    // checkActionability throws ActionabilityError → withRetry retries → succeeds.
    await sdk.locator('#delayed-enable-btn').click();
    const page = await sdk.getPage();
    const value = await page.$eval(
      '#status',
      (el) => (el as HTMLElement).dataset.value,
    );
    expect(value).toBe('delayed-btn-clicked');
  });
});

// ─── Part 8: Resilience ───────────────────────────────────────────────────────

describe('UI Coverage — Resilience', () => {
  let failFastSdk: AutomationSDK;

  beforeAll(async () => {
    // A fast-failing SDK instance shares the same Chrome process but uses its
    // own Puppeteer connection.  Very short timeout + 1 retry keeps missing-
    // element tests to ~3 s instead of 30 s.
    failFastSdk = new AutomationSDK({
      browserWSEndpoint: browser.wsEndpoint(),
      defaultTimeout: 1500,
      retries: 1,
      retryDelay: 100,
    });
    await failFastSdk.connect();
  });

  afterAll(async () => {
    await failFastSdk.disconnect();
  });

  it('locating a non-existent element throws rather than hanging indefinitely', async () => {
    await expect(
      failFastSdk.locator('#totally-nonexistent-element').click(),
    ).rejects.toThrow();
  });

  it('switchToTab() throws for an out-of-bounds index', async () => {
    await expect(sdk.switchToTab(999)).rejects.toThrow('out of bounds');
  });
});

// ─── Part 9: iFrame interaction ───────────────────────────────────────────────

describe('UI Coverage — iFrame Interaction', () => {
  beforeEach(navigateToMain);

  it('clicks a button inside an iFrame and verifies the result', async () => {
    await sdk.frame('#frame1').locator('#iframe-btn').click();

    // Verify outcome inside the iFrame content document.
    const page   = await sdk.getPage();
    const frameEl = await page.$('#frame1');
    if (!frameEl) throw new Error('iFrame element not found');
    const frame = await frameEl.contentFrame();
    if (!frame)   throw new Error('Could not get iFrame content frame');

    const resultVisible = await frame.$eval(
      '#iframe-result',
      (el) => (el as HTMLElement).style.display !== 'none',
    );
    expect(resultVisible).toBe(true);
  });
});

// ─── Part 10: Shadow DOM interaction ─────────────────────────────────────────

describe('UI Coverage — Shadow DOM Interaction', () => {
  beforeEach(navigateToMain);

  it('clicks a button inside a shadow root and verifies the result', async () => {
    await sdk.locator('shadow=#shadow-btn').click();

    const page = await sdk.getPage();
    const resultVisible = await page.evaluate(() => {
      const host = document.getElementById('shadow-host');
      if (!host || !host.shadowRoot) return false;
      const result = host.shadowRoot.getElementById('shadow-result');
      return result ? result.style.display !== 'none' : false;
    });
    expect(resultVisible).toBe(true);
  });
});

// ─── Part 11: Multi-tab management (LAST) ─────────────────────────────────────
//
// newPage() is ONLY called after the SDK has disconnected to avoid disrupting
// its CDP session.  The SDK reconnects afterwards and tab2 is intentionally
// NOT closed here — browser.close() in afterAll handles all remaining tabs.

describe('UI Coverage — Multi-tab Management', () => {
  it('getTabs() returns at least one tab', async () => {
    const tabs = await sdk.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('opens a second tab via disconnect → newPage() → reconnect, then queries it', async () => {
    // Disconnect first so that browser.newPage() does not disrupt the SDK's CDP session.
    await sdk.disconnect();

    const tab2 = await browser.newPage();
    await tab2.goto(urlFor('/'), { waitUntil: 'domcontentloaded' });

    // Reconnect — PuppeteerAdapter picks up pages[0] as primary page.
    await sdk.connect();
    const sdkPage = await sdk.getPage();
    await sdkPage.goto(urlFor('/'), { waitUntil: 'domcontentloaded' });

    const tabs = await sdk.getTabs();
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    const tabUrl = await sdk.executeOnTab(1, async (page) => page.url());
    expect(typeof tabUrl).toBe('string');
    expect(tabUrl.length).toBeGreaterThan(0);

    // DO NOT close tab2 — closing a tab that shares a renderer process with the
    // SDK's tab can trigger Runtime.executionContextsCleared, invalidating
    // execution contexts.  browser.close() in afterAll handles cleanup.
  });
});
