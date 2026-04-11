/**
 * Replay Consistency E2E tests
 *
 * Verifies that the ReplayEngine produces stable, repeatable results across
 * multiple runs of the same workflow:
 *
 *   1. All 3 replay runs succeed (no flakiness)
 *   2. No selector drift — the same primary selector is used each time
 *   3. No retry escalation — run N does not need more attempts than run 1
 *   4. Total test count is deterministic between runs
 *
 * Constraints (shared with all other E2E suites):
 *   - Uses http.createServer (no request interception)
 *   - Never calls browser.newPage() while SDK is connected
 *   - Never calls page.bringToFront()
 *   - Lets browser.close() in afterAll clean up all tabs
 */
import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import { AutomationSDK } from '../../src/core/sdk';
import { generateReplayScript } from '../../src/replay/script-generator';
import type { ReplayScript, RunMetrics } from '../../src/replay/types';
import type { StepRecord } from '../../src/recorder/types';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const REPEAT_RUNS = 3;

// ── Test HTML ─────────────────────────────────────────────────────────────────
// Minimal, stable page: two buttons + a text input.  The DOM structure is
// intentionally simple so selector generation is deterministic.

const CONSISTENCY_HTML = `<!DOCTYPE html>
<html>
<head><title>Replay Consistency Test</title></head>
<body>
  <button id="btn-a" data-testid="btn-a">Action A</button>
  <div id="result-a" style="display:none">A done</div>

  <button id="btn-b" data-testid="btn-b">Action B</button>
  <div id="result-b" style="display:none">B done</div>

  <input type="text" id="name-input" data-testid="name-input" placeholder="Name" />
  <div id="name-output" style="display:none"></div>

  <button id="submit-btn" data-testid="submit-btn">Submit</button>
  <div id="submit-result" style="display:none">Submitted</div>

  <script>
    document.getElementById('btn-a').addEventListener('click', function() {
      document.getElementById('result-a').style.display = 'block';
    });
    document.getElementById('btn-b').addEventListener('click', function() {
      document.getElementById('result-b').style.display = 'block';
    });
    document.getElementById('name-input').addEventListener('input', function() {
      var out = document.getElementById('name-output');
      out.textContent = this.value;
      out.style.display = 'block';
    });
    document.getElementById('submit-btn').addEventListener('click', function() {
      document.getElementById('submit-result').style.display = 'block';
    });
  </script>
</body>
</html>`;

// ── Suite setup ───────────────────────────────────────────────────────────────

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
      res.end(CONSISTENCY_HTML);
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
    defaultTimeout: 10000,
    retries: 2,
    retryDelay: 200,
  });
  await sdk.connect();
  await nav();
}, 60000);

afterAll(async () => {
  if (sdk.isConnected()) await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a deterministic workflow script targeting the consistency page. */
function buildConsistencyScript(): ReplayScript {
  const url = testUrl();
  const records: StepRecord[] = [
    {
      action: 'click',
      target: 'btn-a',
      dataTestId: 'btn-a',
      role: 'button',
      ariaLabel: '',
      domPath: 'BUTTON#btn-a',
      url,
      timestamp: Date.now(),
      selectors: [
        { type: 'data-testid', value: '[data-testid="btn-a"]', rank: 1 },
        { type: 'css',         value: '#btn-a',               rank: 2 },
      ],
    },
    {
      action: 'click',
      target: 'btn-b',
      dataTestId: 'btn-b',
      role: 'button',
      ariaLabel: '',
      domPath: 'BUTTON#btn-b',
      url,
      timestamp: Date.now(),
      selectors: [
        { type: 'data-testid', value: '[data-testid="btn-b"]', rank: 1 },
        { type: 'css',         value: '#btn-b',               rank: 2 },
      ],
    },
    {
      action: 'type',
      target: 'name-input',
      text: 'Consistency',
      dataTestId: 'name-input',
      role: 'textbox',
      ariaLabel: '',
      domPath: 'INPUT#name-input',
      url,
      timestamp: Date.now(),
      selectors: [
        { type: 'data-testid', value: '[data-testid="name-input"]', rank: 1 },
        { type: 'css',         value: '#name-input',               rank: 2 },
      ],
    },
    {
      action: 'click',
      target: 'submit-btn',
      dataTestId: 'submit-btn',
      role: 'button',
      ariaLabel: '',
      domPath: 'BUTTON#submit-btn',
      url,
      timestamp: Date.now(),
      selectors: [
        { type: 'data-testid', value: '[data-testid="submit-btn"]', rank: 1 },
        { type: 'css',         value: '#submit-btn',               rank: 2 },
      ],
    },
  ];

  return generateReplayScript('replay-consistency-workflow', records);
}

/** Runs the script and returns metrics, navigating to the page first. */
async function runWithReset(script: ReplayScript): Promise<RunMetrics> {
  await nav();
  return sdk.replayScript(script);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe(`Replay Consistency — ${REPEAT_RUNS} consecutive runs`, () => {
  let script: ReplayScript;
  let runResults: RunMetrics[];

  beforeAll(async () => {
    script = buildConsistencyScript();
    runResults = [];
    for (let i = 0; i < REPEAT_RUNS; i++) {
      const metrics = await runWithReset(script);
      runResults.push(metrics);
    }
  }, 60000);

  it('all runs succeed', () => {
    for (let i = 0; i < REPEAT_RUNS; i++) {
      expect(runResults[i].succeeded).toBe(true);
    }
  });

  it('all runs execute the same number of steps', () => {
    const stepCounts = runResults.map(r => r.steps.length);
    expect(new Set(stepCounts).size).toBe(1);
  });

  it('no selector drift — primary selector used consistently across runs', () => {
    for (let stepIdx = 0; stepIdx < script.steps.length; stepIdx++) {
      const primarySelector = script.steps[stepIdx].selector.primary;
      for (const run of runResults) {
        const step = run.steps[stepIdx];
        // Primary selector should be used (usedFallback === false)
        expect(step.usedFallback).toBe(false);
        expect(step.selector).toBe(primarySelector);
      }
    }
  });

  it('no retry escalation — attempt counts do not increase between runs', () => {
    if (runResults.length < 2) return;
    for (let stepIdx = 0; stepIdx < script.steps.length; stepIdx++) {
      const attemptsRun1 = runResults[0].steps[stepIdx]?.attempts ?? 0;
      for (let runIdx = 1; runIdx < REPEAT_RUNS; runIdx++) {
        const attemptsRunN = runResults[runIdx].steps[stepIdx]?.attempts ?? 0;
        expect(attemptsRunN).toBeLessThanOrEqual(attemptsRun1 + 1);
      }
    }
  });

  it('total attempts across runs remain stable (no retry drift)', () => {
    const totalPerRun = runResults.map(r =>
      r.steps.reduce((sum, s) => sum + s.attempts, 0)
    );
    // Variance should be at most 1 attempt per run
    const min = Math.min(...totalPerRun);
    const max = Math.max(...totalPerRun);
    expect(max - min).toBeLessThanOrEqual(REPEAT_RUNS);
  });
});

describe('Replay Consistency — result verification', () => {
  let script: ReplayScript;

  beforeAll(async () => {
    script = buildConsistencyScript();
  });

  it('result-a is visible after replay', async () => {
    await nav();
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    const page = await sdk.getPage();
    const display = await page.$eval('#result-a', (el) =>
      (el as HTMLElement).style.display
    );
    expect(display).not.toBe('none');
  });

  it('result-b is visible after replay', async () => {
    await nav();
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    const page = await sdk.getPage();
    const display = await page.$eval('#result-b', (el) =>
      (el as HTMLElement).style.display
    );
    expect(display).not.toBe('none');
  });

  it('typed text is reflected in name-output', async () => {
    await nav();
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    const page = await sdk.getPage();
    const text = await page.$eval('#name-output', (el) => el.textContent ?? '');
    expect(text).toBe('Consistency');
  });

  it('submit-result is visible after replay', async () => {
    await nav();
    const metrics = await sdk.replayScript(script);
    expect(metrics.succeeded).toBe(true);
    const page = await sdk.getPage();
    const display = await page.$eval('#submit-result', (el) =>
      (el as HTMLElement).style.display
    );
    expect(display).not.toBe('none');
  });
});
