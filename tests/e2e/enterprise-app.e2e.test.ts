/**
 * Enterprise App E2E Tests
 *
 * Exercises all 6 modules of test-app/index.html using the AutomationSDK.
 *
 * Module 1 — Complex Form        (5 tests)
 * Module 2 — Multi-Step Workflow (4 tests)
 * Module 3 — Data Table          (5 tests)
 * Module 4 — Dynamic UI          (5 tests)
 * Module 5 — Scroll + Lazy Load  (3 tests)
 * Module 6 — Modern UI Patterns  (4 tests)
 *
 * Design constraints (same as all other E2E suites):
 *   - http.createServer serves the HTML file (no request interception)
 *   - Never call browser.newPage() while SDK is connected
 *   - Never call bringToFront() in headless Chrome
 *   - Let browser.close() in afterAll handle tab clean-up
 *   - All test actions go through SDK methods (no hardcoded raw CSS selectors)
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const APP_HTML = fs.readFileSync(
  path.join(__dirname, '../../test-app/index.html'),
  'utf8',
);

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

// ─── page helpers (for assertions only — not for driving interactions) ─────

async function isVisible(testid: string): Promise<boolean> {
  const page = await sdk.getPage();
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => {
      const s = window.getComputedStyle(el as HTMLElement);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    })
    .catch(() => false);
}

async function textOf(testid: string): Promise<string> {
  const page = await sdk.getPage();
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => el.textContent?.trim() ?? '')
    .catch(() => '');
}

async function valueOf(testid: string): Promise<string> {
  const page = await sdk.getPage();
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => (el as HTMLInputElement).value ?? '')
    .catch(() => '');
}

async function rowCount(): Promise<number> {
  const page = await sdk.getPage();
  return page.$$eval('[data-testid="table-body"] tr', (rows) => rows.length);
}

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Start HTTP server
  await new Promise<void>((resolve) => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(APP_HTML);
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as { port: number }).port;
      resolve();
    });
  });

  // 2. Launch Chrome
  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // 3. Connect SDK
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

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 1 — COMPLEX FORM
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 1 — Complex Form', () => {
  beforeEach(nav);

  it('types into name and email inputs and values are captured', async () => {
    await sdk.getByTestId('form-name').type('Jane Doe');
    await sdk.getByTestId('form-email').type('jane@example.com');

    expect(await valueOf('form-name')).toBe('Jane Doe');
    expect(await valueOf('form-email')).toBe('jane@example.com');
  });

  it('selects a department from the native dropdown', async () => {
    const page = await sdk.getPage();
    await page.select('[data-testid="form-dept"]', 'engineering');

    const selected = await valueOf('form-dept');
    expect(selected).toBe('engineering');
  });

  it('opens custom priority dropdown and selects High priority', async () => {
    await sdk.waitForElementAfterAction(
      () => sdk.getByTestId('priority-trigger').click(),
      '[data-testid="priority-menu"]:not(.hidden)',
    );
    await sdk.getByTestId('priority-opt-high').click();

    expect(await isVisible('priority-menu')).toBe(false);
    expect(await textOf('priority-selected')).toBe('High');
  });

  it('selects a radio button and checks multiple checkboxes', async () => {
    await sdk.getByTestId('radio-full-time').click();
    await sdk.getByTestId('chk-feature-a').click();
    await sdk.getByTestId('chk-feature-c').click();

    const page = await sdk.getPage();
    const radioChecked = await page.$eval(
      '[data-testid="radio-full-time"]',
      (el) => (el as HTMLInputElement).checked,
    );
    const chkA = await page.$eval(
      '[data-testid="chk-feature-a"]',
      (el) => (el as HTMLInputElement).checked,
    );
    const chkC = await page.$eval(
      '[data-testid="chk-feature-c"]',
      (el) => (el as HTMLInputElement).checked,
    );
    expect(radioChecked).toBe(true);
    expect(chkA).toBe(true);
    expect(chkC).toBe(true);
  });

  it('shows validation errors on empty submit; shows success after valid data', async () => {
    // Submit empty → errors
    await sdk.getByTestId('form-submit').click();
    expect(await isVisible('error-name')).toBe(true);
    expect(await isVisible('error-email')).toBe(true);
    expect(await isVisible('form-success')).toBe(false);

    // Fill in valid data → success
    await sdk.getByTestId('form-name').type('Jane Doe');
    await sdk.getByTestId('form-email').type('jane@example.com');
    await sdk.getByTestId('form-submit').click();
    expect(await isVisible('form-success')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 2 — MULTI-STEP WORKFLOW
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 2 — Multi-Step Workflow', () => {
  beforeEach(nav);

  it('starts on step 1 and navigates forward to step 2 then back', async () => {
    expect(await isVisible('step-1-panel')).toBe(true);
    expect(await isVisible('step-prev')).toBe(false);

    await sdk.getByTestId('step-next').click();
    expect(await isVisible('step-2-panel')).toBe(true);
    expect(await isVisible('step-1-panel')).toBe(false);

    await sdk.getByTestId('step-prev').click();
    expect(await isVisible('step-1-panel')).toBe(true);
  });

  it('shows conditional company-size field when Enterprise account type is selected', async () => {
    const page = await sdk.getPage();

    // Initially the company-size field should be hidden
    await page.waitForSelector('[data-testid="step1-user-type"]');
    const initiallyHidden = await page
      .$eval('#company-size-wrapper', (el) => el.classList.contains('hidden'))
      .catch(() => true);
    expect(initiallyHidden).toBe(true);

    // Select "Enterprise"
    await page.select('[data-testid="step1-user-type"]', 'enterprise');

    const nowVisible = await page
      .$eval('#company-size-wrapper', (el) => !el.classList.contains('hidden'));
    expect(nowVisible).toBe(true);
  });

  it('populates review step with entered data', async () => {
    const page = await sdk.getPage();

    // Step 1: fill in name and account type
    await sdk.getByTestId('step1-name').type('Alice Tester');
    await page.select('[data-testid="step1-user-type"]', 'team');
    await sdk.getByTestId('step-next').click();

    // Step 2: pick a plan
    await page.select('[data-testid="step2-plan"]', 'pro');
    await sdk.getByTestId('step-next').click();

    // Step 3: review values
    expect(await textOf('review-name')).toBe('Alice Tester');
    expect(await textOf('review-type')).toBe('team');
    expect(await textOf('review-plan')).toBe('pro');
  });

  it('completes the workflow and shows success message', async () => {
    const page = await sdk.getPage();

    await sdk.getByTestId('step1-name').type('Bob Complete');
    await sdk.getByTestId('step-next').click();
    await sdk.getByTestId('step-next').click();
    await sdk.getByTestId('workflow-submit').click();

    expect(await isVisible('workflow-success')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 3 — DATA TABLE
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 3 — Data Table', () => {
  beforeEach(nav);

  it('renders the first page with 4 rows by default', async () => {
    const count = await rowCount();
    expect(count).toBe(4);
    expect(await textOf('page-indicator')).toBe('Page 1 of 3');
  });

  it('search filters rows by employee name', async () => {
    await sdk.getByTestId('table-search').type('Alice');

    const count = await rowCount();
    expect(count).toBe(1);

    const page = await sdk.getPage();
    const cellText = await page.$eval(
      '[data-testid="table-body"] tr:first-child td:first-child',
      (el) => el.textContent?.trim(),
    );
    expect(cellText).toBe('Alice Johnson');
  });

  it('filter dropdown narrows table to Engineering rows only', async () => {
    const page = await sdk.getPage();
    await page.select('[data-testid="table-filter"]', 'Engineering');

    const count = await rowCount();
    expect(count).toBe(4); // Alice, Carol, Frank, Iris — exactly 1 page

    expect(await textOf('page-indicator')).toBe('Page 1 of 1');
  });

  it('pagination next advances to page 2 and prev returns to page 1', async () => {
    await sdk.getByTestId('page-next').click();
    expect(await textOf('page-indicator')).toBe('Page 2 of 3');

    const page = await sdk.getPage();
    const firstCell = await page.$eval(
      '[data-testid="table-body"] tr:first-child td:first-child',
      (el) => el.textContent?.trim(),
    );
    expect(firstCell).toBe('Eve Davis'); // row 5 on page 2

    await sdk.getByTestId('page-prev').click();
    expect(await textOf('page-indicator')).toBe('Page 1 of 3');
  });

  it('clicking a row opens the detail panel with correct employee info', async () => {
    expect(await isVisible('detail-panel')).toBe(false);

    // Click the first row (Alice Johnson)
    await sdk.getByTestId('row-1').click();

    expect(await isVisible('detail-panel')).toBe(true);
    expect(await textOf('detail-name')).toBe('Alice Johnson');
    expect(await textOf('detail-dept')).toBe('Engineering');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 4 — DYNAMIC UI
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 4 — Dynamic UI', () => {
  beforeEach(nav);

  it('opens the modal on button click', async () => {
    expect(await isVisible('modal-overlay')).toBe(false);

    await sdk.waitForElementAfterAction(
      () => sdk.getByTestId('modal-open').click(),
      '.modal-overlay.open',
    );

    expect(await isVisible('modal-overlay')).toBe(true);
  });

  it('closes the modal with the Cancel button', async () => {
    await sdk.waitForElementAfterAction(
      () => sdk.getByTestId('modal-open').click(),
      '.modal-overlay.open',
    );
    await sdk.getByTestId('modal-close').click();

    const page = await sdk.getPage();
    await page.waitForFunction(
      () => !document.querySelector('.modal-overlay')!.classList.contains('open'),
      { timeout: 5000 },
    );
    expect(await isVisible('modal-overlay')).toBe(false);
  });

  it('types into modal input and confirms → shows result', async () => {
    await sdk.waitForElementAfterAction(
      () => sdk.getByTestId('modal-open').click(),
      '.modal-overlay.open',
    );
    await sdk.getByTestId('modal-input').type('Important note');
    await sdk.getByTestId('modal-confirm').click();

    expect(await isVisible('modal-result')).toBe(true);
  });

  it('loading trigger shows spinner then displays completion badge', async () => {
    expect(await isVisible('spinner')).toBe(false);
    expect(await isVisible('loading-result')).toBe(false);

    await sdk.getByTestId('loading-trigger').click();

    const page = await sdk.getPage();
    // Spinner should appear immediately
    await page.waitForSelector('[data-testid="spinner"]:not(.hidden)', { timeout: 3000 });
    expect(await isVisible('spinner')).toBe(true);

    // After ~900 ms spinner hides and result appears
    await page.waitForSelector('[data-testid="loading-result"]:not(.hidden)', { timeout: 5000 });
    expect(await isVisible('loading-result')).toBe(true);
    expect(await isVisible('spinner')).toBe(false);
  });

  it('custom action menu opens on trigger click and menu item fires result', async () => {
    expect(await isVisible('action-menu')).toBe(false);

    await sdk.waitForElementAfterAction(
      () => sdk.getByTestId('action-menu-trigger').click(),
      '[data-testid="action-menu"]:not(.hidden)',
    );
    expect(await isVisible('action-menu')).toBe(true);

    await sdk.getByTestId('action-opt-edit').click();
    expect(await isVisible('action-result')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 5 — SCROLL + LAZY LOAD
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 5 — Scroll + Lazy Load', () => {
  beforeEach(nav);

  it('findWithScroll discovers the below-fold button and returns an ElementHandle', async () => {
    const element = await sdk.findWithScroll('[data-testid="scroll-target-btn"]', {
      scrollStep: 400,
      maxScrolls: 25,
      waitAfterScroll: 300,
      timeout: 30000,
    });
    expect(element).toBeTruthy();
  });

  it('clicking the below-fold button (via scrollFind Locator) shows result', async () => {
    const element = await sdk
      .locator('[data-testid="scroll-target-btn"]')
      .scrollFind({ scrollStep: 400, maxScrolls: 25, waitAfterScroll: 300, timeout: 30000 });

    await element.click();
    expect(await isVisible('scroll-target-result')).toBe(true);
  });

  it('lazy-loaded items appear after scrolling to the lazy sentinel', async () => {
    // Scroll to the lazy sentinel area to trigger content injection
    const page = await sdk.getPage();
    await page.evaluate(() => {
      const s = document.getElementById('lazy-sentinel');
      if (s) s.scrollIntoView({ behavior: 'instant' });
    });

    // Wait for lazy items to be injected
    await page.waitForSelector('[data-testid="lazy-item-1"]', { timeout: 10000 });

    const count = await page.$$eval(
      '[data-testid^="lazy-item-"]',
      (items) => items.length,
    );
    expect(count).toBe(5);
    expect(await isVisible('lazy-count')).toBe(true);
    expect(await textOf('lazy-count')).toBe('Items loaded: 5');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MODULE 6 — MODERN UI PATTERNS
// ═════════════════════════════════════════════════════════════════════════════

describe('Module 6 — Modern UI Patterns', () => {
  beforeEach(nav);

  it('div-based button (role=button) is clickable via getByRole and shows result', async () => {
    expect(await isVisible('div-action-result')).toBe(false);

    await sdk.getByRole('button', { name: 'Div Action' }).click();

    expect(await isVisible('div-action-result')).toBe(true);
  });

  it('span role=link is clickable via getByRole and shows result', async () => {
    expect(await isVisible('span-link-result')).toBe(false);

    await sdk.getByRole('link', { name: 'Navigate to Dashboard' }).click();

    expect(await isVisible('span-link-result')).toBe(true);
  });

  it('toggle switch changes aria-checked and status text on each click', async () => {
    const page = await sdk.getPage();

    const initialState = await page.$eval(
      '[data-testid="feature-toggle"]',
      (el) => el.getAttribute('aria-checked'),
    );
    expect(initialState).toBe('false');
    expect(await textOf('toggle-status')).toBe('Off');

    await sdk.getByTestId('feature-toggle').click();

    const afterFirst = await page.$eval(
      '[data-testid="feature-toggle"]',
      (el) => el.getAttribute('aria-checked'),
    );
    expect(afterFirst).toBe('true');
    expect(await textOf('toggle-status')).toBe('On');

    // Second click turns it back off
    await sdk.getByTestId('feature-toggle').click();
    const afterSecond = await page.$eval(
      '[data-testid="feature-toggle"]',
      (el) => el.getAttribute('aria-checked'),
    );
    expect(afterSecond).toBe('false');
  });

  it('tab navigation shows the correct panel and hides others', async () => {
    // Initially Overview panel is active
    expect(await isVisible('tab-panel-overview')).toBe(true);
    expect(await isVisible('tab-panel-data')).toBe(false);
    expect(await isVisible('tab-panel-settings')).toBe(false);

    // Click Data tab
    await sdk.getByTestId('tab-data').click();
    expect(await isVisible('tab-panel-data')).toBe(true);
    expect(await isVisible('tab-panel-overview')).toBe(false);

    // Click Settings tab
    await sdk.getByTestId('tab-settings').click();
    expect(await isVisible('tab-panel-settings')).toBe(true);
    expect(await isVisible('tab-panel-data')).toBe(false);
  });
});
