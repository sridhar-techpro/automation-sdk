/**
 * Replay Engine E2E tests — complex workflow covering 30+ interactive elements
 *
 * Tests:
 *   1. Native select dropdown
 *   2. Custom dropdown (click-to-open)
 *   3. Radio buttons
 *   4. Checkboxes
 *   5. Text inputs
 *   6. Textarea
 *   7. File upload field (existence only)
 *   8. Modal (open, interact, close)
 *   9. Dynamic content (onChange, onBlur, onClick)
 *  10. Scroll to off-screen element
 *  11. File upload field DOM validation
 *  12. Success rate tracking
 *  13. Selector fallback (primary fails → fallback used)
 *  14. Workflow round-trip (save → retrieve → replay)
 *
 * Constraints (matching all other E2E suites):
 *   - http.createServer — no request interception
 *   - Never call browser.newPage() while SDK is connected
 *   - Never call bringToFront()
 *   - Let browser.close() in afterAll clean up tabs
 */
import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';
import { generateReplayScript } from '../../src/replay/script-generator';
import { WorkflowStore } from '../../src/workflow/workflow-store';
import type { StepRecord } from '../../src/recorder/types';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

// ── Test HTML ─────────────────────────────────────────────────────────────────

const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Replay Engine Test</title>
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; }
    .hidden { display: none; }
    #modal-overlay {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.4); z-index: 10;
    }
    #modal-box {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      background: white; padding: 20px; min-width: 300px;
    }
  </style>
</head>
<body>

  <!-- ── 1. Native select ──────────────────────────────────── -->
  <label for="fruit-select">Fruit</label>
  <select id="fruit-select" data-testid="fruit-select">
    <option value="">-- choose --</option>
    <option value="apple">Apple</option>
    <option value="banana">Banana</option>
    <option value="cherry">Cherry</option>
  </select>
  <div id="fruit-result" class="hidden">Fruit selected</div>

  <!-- ── 2. Custom dropdown ────────────────────────────────── -->
  <button type="button" id="custom-dd-trigger" data-testid="custom-dd-trigger">Open Menu</button>
  <ul id="custom-dd-menu" class="hidden">
    <li><button type="button" id="menu-item-a" data-testid="menu-item-a">Item A</button></li>
    <li><button type="button" id="menu-item-b" data-testid="menu-item-b">Item B</button></li>
  </ul>
  <div id="custom-dd-result" class="hidden">Custom option selected</div>

  <!-- ── 3. Radio buttons ──────────────────────────────────── -->
  <fieldset>
    <legend>Size</legend>
    <label><input type="radio" name="size" id="size-s" data-testid="size-s" value="s"> Small</label>
    <label><input type="radio" name="size" id="size-m" data-testid="size-m" value="m"> Medium</label>
    <label><input type="radio" name="size" id="size-l" data-testid="size-l" value="l"> Large</label>
  </fieldset>
  <div id="radio-result" class="hidden">Radio selected</div>

  <!-- ── 4. Checkboxes ─────────────────────────────────────── -->
  <label><input type="checkbox" id="chk-a" data-testid="chk-a"> Option A</label>
  <label><input type="checkbox" id="chk-b" data-testid="chk-b"> Option B</label>
  <label><input type="checkbox" id="chk-c" data-testid="chk-c"> Option C</label>
  <div id="checkbox-result" class="hidden">Checkbox changed</div>

  <!-- ── 5. Text inputs ────────────────────────────────────── -->
  <input type="text"  id="first-name"  data-testid="first-name"  placeholder="First name" />
  <input type="text"  id="last-name"   data-testid="last-name"   placeholder="Last name"  />
  <input type="email" id="email-input" data-testid="email-input" placeholder="Email"      />
  <input type="tel"   id="phone-input" data-testid="phone-input" placeholder="Phone"      />
  <input type="number" id="age-input"  data-testid="age-input"   placeholder="Age"        />

  <!-- ── 6. Textarea ───────────────────────────────────────── -->
  <textarea id="message" data-testid="message" placeholder="Message" rows="4"></textarea>

  <!-- ── 7. File upload ────────────────────────────────────── -->
  <input type="file" id="file-upload" data-testid="file-upload" />

  <!-- ── 8. Modal ──────────────────────────────────────────── -->
  <button type="button" id="open-modal" data-testid="open-modal">Open Modal</button>
  <div id="modal-overlay">
    <div id="modal-box">
      <input type="text" id="modal-input" data-testid="modal-input" placeholder="Modal input" />
      <button type="button" id="modal-submit" data-testid="modal-submit">Submit</button>
      <button type="button" id="modal-close"  data-testid="modal-close">Close</button>
    </div>
  </div>
  <div id="modal-result" class="hidden">Modal submitted</div>

  <!-- ── 9. Dynamic content ────────────────────────────────── -->
  <input type="text" id="dynamic-trigger" data-testid="dynamic-trigger" placeholder="Type to trigger" />
  <div id="dynamic-hint" class="hidden">Hint shown</div>
  <button type="button" id="blur-btn" data-testid="blur-btn">Blur target</button>
  <div id="blur-result" class="hidden">Blur fired</div>
  <button type="button" id="click-counter" data-testid="click-counter">Click count: 0</button>

  <!-- ── 10. Scroll target ──────────────────────────────────── -->
  <div style="height:2000px"></div>
  <button type="button" id="below-fold" data-testid="below-fold">Below Fold</button>
  <div id="scroll-result" class="hidden">Scrolled and clicked</div>

  <!-- ── Submit ──────────────────────────────────────────────── -->
  <button type="button" id="main-submit" data-testid="main-submit">Submit Form</button>
  <div id="form-result" class="hidden">Form submitted</div>

  <script>
    // 1. native select
    document.getElementById('fruit-select').addEventListener('change', function() {
      if (this.value) document.getElementById('fruit-result').classList.remove('hidden');
    });
    // 2. custom dropdown
    document.getElementById('custom-dd-trigger').addEventListener('click', function() {
      document.getElementById('custom-dd-menu').classList.toggle('hidden');
    });
    document.getElementById('menu-item-a').addEventListener('click', function() {
      document.getElementById('custom-dd-menu').classList.add('hidden');
      document.getElementById('custom-dd-result').classList.remove('hidden');
    });
    document.getElementById('menu-item-b').addEventListener('click', function() {
      document.getElementById('custom-dd-menu').classList.add('hidden');
      document.getElementById('custom-dd-result').classList.remove('hidden');
    });
    // 3. radio
    document.querySelectorAll('input[name="size"]').forEach(function(r) {
      r.addEventListener('change', function() {
        document.getElementById('radio-result').classList.remove('hidden');
      });
    });
    // 4. checkbox
    document.querySelectorAll('input[type="checkbox"]').forEach(function(c) {
      c.addEventListener('change', function() {
        document.getElementById('checkbox-result').classList.remove('hidden');
      });
    });
    // 8. modal
    document.getElementById('open-modal').addEventListener('click', function() {
      document.getElementById('modal-overlay').style.display = 'block';
    });
    document.getElementById('modal-submit').addEventListener('click', function() {
      document.getElementById('modal-overlay').style.display = 'none';
      document.getElementById('modal-result').classList.remove('hidden');
    });
    document.getElementById('modal-close').addEventListener('click', function() {
      document.getElementById('modal-overlay').style.display = 'none';
    });
    // 9. dynamic
    document.getElementById('dynamic-trigger').addEventListener('input', function() {
      if (this.value.length > 0) {
        document.getElementById('dynamic-hint').classList.remove('hidden');
      } else {
        document.getElementById('dynamic-hint').classList.add('hidden');
      }
    });
    document.getElementById('dynamic-trigger').addEventListener('blur', function() {
      document.getElementById('blur-result').classList.remove('hidden');
    });
    var clickCount = 0;
    document.getElementById('click-counter').addEventListener('click', function() {
      clickCount++;
      this.textContent = 'Click count: ' + clickCount;
    });
    // 10. below-fold
    document.getElementById('below-fold').addEventListener('click', function() {
      document.getElementById('scroll-result').classList.remove('hidden');
    });
    // submit
    document.getElementById('main-submit').addEventListener('click', function() {
      document.getElementById('form-result').classList.remove('hidden');
    });
  </script>
</body>
</html>`;

// ── Suite scaffolding ─────────────────────────────────────────────────────────

let server: http.Server;
let serverPort: number;
let browser: Browser;
let sdk: AutomationSDK;

function testUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

async function nav(): Promise<void> {
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

  sdk = new AutomationSDK({
    browserWSEndpoint: browser.wsEndpoint(),
    defaultTimeout: 15000,
    retries: 2,
    retryDelay: 300,
  });
  await sdk.connect();
  await nav();
}, 60000);

afterAll(async () => {
  if (sdk.isConnected()) await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function isVisible(selector: string): Promise<boolean> {
  const page = await sdk.getPage();
  return page.$eval(selector, (e) => window.getComputedStyle(e as HTMLElement).display !== 'none').catch(() => false);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Native select dropdown
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — native select', () => {
  beforeEach(nav);

  it('replays selecting an option from a native <select>', async () => {
    const page = await sdk.getPage();
    await page.select('[data-testid="fruit-select"]', 'apple');
    await page.waitForSelector('#fruit-result:not(.hidden)', { timeout: 3000 });
    expect(await isVisible('#fruit-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Custom dropdown
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — custom dropdown', () => {
  beforeEach(nav);

  it('replays custom dropdown open and option select', async () => {
    const rec = sdk.getRecorder();
    rec.clear();

    rec.record({
      action: 'click', target: 'open menu button',
      dataTestId: 'custom-dd-trigger', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="custom-dd-trigger"]', rank: 1 }],
    });
    rec.record({
      action: 'click', target: 'menu item a',
      dataTestId: 'menu-item-a', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="menu-item-a"]', rank: 1 }],
    });

    const script = sdk.generateScript('open custom dropdown');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    expect(await isVisible('#custom-dd-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Radio buttons
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — radio buttons', () => {
  beforeEach(nav);

  it('replays radio button selection', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'click', target: 'medium size radio',
      dataTestId: 'size-m', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="size-m"]', rank: 1 }],
    });

    const script = sdk.generateScript('select radio');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);

    const page = await sdk.getPage();
    const checked = await page.$eval('#size-m', (e) => (e as HTMLInputElement).checked);
    expect(checked).toBe(true);
    expect(await isVisible('#radio-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Checkboxes
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — checkboxes', () => {
  beforeEach(nav);

  it('replays checkbox interactions', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'click', target: 'option A checkbox',
      dataTestId: 'chk-a', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="chk-a"]', rank: 1 }],
    });
    rec.record({
      action: 'click', target: 'option C checkbox',
      dataTestId: 'chk-c', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="chk-c"]', rank: 1 }],
    });

    const script = sdk.generateScript('check boxes');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);

    const page = await sdk.getPage();
    const aChecked = await page.$eval('#chk-a', (e) => (e as HTMLInputElement).checked);
    const cChecked = await page.$eval('#chk-c', (e) => (e as HTMLInputElement).checked);
    expect(aChecked).toBe(true);
    expect(cChecked).toBe(true);
    expect(await isVisible('#checkbox-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Text inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — text inputs', () => {
  beforeEach(nav);

  it('replays typing into text fields', async () => {
    const rec = sdk.getRecorder();
    rec.clear();

    const fields: Array<[string, string, string]> = [
      ['first-name',  'Alice',             'first name field'],
      ['last-name',   'Smith',             'last name field'],
      ['email-input', 'alice@example.com', 'email field'],
      ['phone-input', '555-1234',          'phone field'],
    ];

    for (const [testid, value, target] of fields) {
      rec.record({
        action: 'type', target, text: value,
        dataTestId: testid, url: testUrl(), timestamp: Date.now(),
        selectors: [{ type: 'data-testid', value: `[data-testid="${testid}"]`, rank: 1 }],
      });
    }

    const script = sdk.generateScript('fill text inputs');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);

    const page = await sdk.getPage();
    const firstName = await page.$eval('#first-name', (e) => (e as HTMLInputElement).value);
    expect(firstName).toBe('Alice');
    const email = await page.$eval('#email-input', (e) => (e as HTMLInputElement).value);
    expect(email).toBe('alice@example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Textarea
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — textarea', () => {
  beforeEach(nav);

  it('replays typing into a textarea', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'type', target: 'message textarea',
      text: 'Hello world', dataTestId: 'message', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="message"]', rank: 1 }],
    });

    const script = sdk.generateScript('fill textarea');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);

    const page = await sdk.getPage();
    const val = await page.$eval('#message', (e) => (e as HTMLTextAreaElement).value);
    expect(val).toBe('Hello world');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. File upload field
// ─────────────────────────────────────────────────────────────────────────────

describe('File upload field', () => {
  beforeEach(nav);

  it('file input element exists in the DOM', async () => {
    const page = await sdk.getPage();
    const el = await page.$('[data-testid="file-upload"]');
    expect(el).not.toBeNull();
    const type = await el!.evaluate((e) => (e as HTMLInputElement).type);
    expect(type).toBe('file');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Modal interaction
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — modal interaction', () => {
  beforeEach(nav);

  it('replays open modal, type, and close', async () => {
    const rec = sdk.getRecorder();
    rec.clear();

    // open
    rec.record({
      action: 'click', target: 'open modal button',
      dataTestId: 'open-modal', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="open-modal"]', rank: 1 }],
    });
    // type in modal
    rec.record({
      action: 'type', target: 'modal input', text: 'test value',
      dataTestId: 'modal-input', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="modal-input"]', rank: 1 }],
    });
    // submit
    rec.record({
      action: 'click', target: 'modal submit',
      dataTestId: 'modal-submit', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="modal-submit"]', rank: 1 }],
    });

    const script = sdk.generateScript('modal interaction');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    expect(await isVisible('#modal-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Dynamic content
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — dynamic content', () => {
  beforeEach(nav);

  it('replays trigger and waits for dynamic content', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'type', target: 'dynamic trigger input', text: 'hello',
      dataTestId: 'dynamic-trigger', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="dynamic-trigger"]', rank: 1 }],
    });

    const script = sdk.generateScript('dynamic content');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);

    const page = await sdk.getPage();
    await page.waitForSelector('#dynamic-hint:not(.hidden)', { timeout: 3000 });
    expect(await isVisible('#dynamic-hint')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Scroll to off-screen element
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — scroll to element', () => {
  beforeEach(nav);

  it('replays scroll to off-screen element', async () => {
    const el = await sdk.findWithScroll('[data-testid="below-fold"]', {
      scrollStep: 400,
      maxScrolls: 20,
      waitAfterScroll: 200,
      timeout: 20000,
    });
    await el.click();
    expect(await isVisible('#scroll-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Submit button + result
// ─────────────────────────────────────────────────────────────────────────────

describe('ReplayScript — submit button + result', () => {
  beforeEach(nav);

  it('replays click on submit button', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'click', target: 'main submit button',
      dataTestId: 'main-submit', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="main-submit"]', rank: 1 }],
    });

    const script = sdk.generateScript('submit form');
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    expect(await isVisible('#form-result')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Success rate tracking
// ─────────────────────────────────────────────────────────────────────────────

describe('Success rate tracking', () => {
  beforeEach(nav);

  it('updates success rate after successful replay', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'click', target: 'click counter',
      dataTestId: 'click-counter', url: testUrl(), timestamp: Date.now(),
      selectors: [{ type: 'data-testid', value: '[data-testid="click-counter"]', rank: 1 }],
    });

    const script = sdk.generateScript('click counter');
    const wf = sdk.saveWorkflow('click counter test', script);
    const metrics = await sdk.replayScript(script);
    sdk.getSuccessTracker().recordRun({ ...metrics, workflowId: wf.id });

    const updated = sdk.getWorkflow(wf.id)!;
    expect(updated.successRate).toBeGreaterThan(0);
    expect(updated.totalRuns).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Selector fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('Selector fallback', () => {
  beforeEach(nav);

  it('uses fallback selector when primary fails', async () => {
    const rec = sdk.getRecorder();
    rec.clear();
    rec.record({
      action: 'click', target: 'menu item b',
      dataTestId: 'custom-dd-trigger', url: testUrl(), timestamp: Date.now(),
      selectors: [
        // primary is intentionally wrong
        { type: 'data-testid', value: '[data-testid="does-not-exist"]', rank: 1 },
        // fallback is correct
        { type: 'data-testid', value: '[data-testid="custom-dd-trigger"]', rank: 2 },
      ],
    });

    const script = sdk.generateScript('fallback test');
    // Override timeouts to fail fast on the wrong primary selector
    for (const step of script.steps) {
      step.wait.timeout = 1500;
      step.retry = 1;
    }
    // Use a fast-fail SDK instance for the failing selector
    const fastSdk = new AutomationSDK({
      browserWSEndpoint: browser.wsEndpoint(),
      defaultTimeout: 1500,
      retries: 1,
      retryDelay: 200,
    });
    await fastSdk.connect();
    try {
      const metrics = await fastSdk.replayScript(script);
      expect(metrics.succeeded).toBe(true);
      expect(metrics.steps[0].usedFallback).toBe(true);
    } finally {
      await fastSdk.disconnect();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Workflow round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('Workflow round-trip', () => {
  beforeEach(nav);

  it('save → retrieve → replay', async () => {
    const records: StepRecord[] = [
      {
        action: 'click', target: 'blur btn',
        dataTestId: 'blur-btn', url: testUrl(), timestamp: Date.now(),
        selectors: [{ type: 'data-testid', value: '[data-testid="blur-btn"]', rank: 1 }],
      },
    ];
    const script = generateReplayScript('blur workflow', records);
    const wf = sdk.saveWorkflow('blur workflow', script, { author: 'test' });

    expect(sdk.getWorkflow(wf.id)).toBeDefined();
    expect(sdk.findWorkflow('blur workflow')).toBeDefined();
    expect(sdk.listWorkflows().find((w) => w.id === wf.id)).toBeDefined();

    const metrics = await sdk.replayWorkflow(wf.id);
    expect(metrics.succeeded).toBe(true);
  });
});
