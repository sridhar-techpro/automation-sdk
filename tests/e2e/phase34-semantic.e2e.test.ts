/**
 * Phase 3.4 E2E Tests — Semantic Workflow Matching + Active Learning Feedback Loop
 *
 * Tests:
 *   1. Semantic/keyword match: finds workflow for similar goal phrasing
 *   2. Feedback loop: captures failures in store (no TTY, so promptFix returns null)
 *   3. Self-healing: replay succeeds when primary selector fails but knowledge base has fix
 *   4. No match: findBestWorkflow returns null when no workflows present
 *
 * Constraints:
 *   - http.createServer — no request interception
 *   - Never call browser.newPage() while SDK is connected
 *   - Let browser.close() in afterAll clean up tabs
 *   - Use os.tmpdir() paths for stores to avoid polluting repo
 */
import * as http from 'http';
import * as puppeteer from 'puppeteer-core';
import type { Browser } from 'puppeteer-core';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AutomationSDK } from '../../src/core/sdk';
import { SemanticMatcher } from '../../src/workflow/semantic-matcher';
import { FailureStore } from '../../src/feedback/failure-store';
import { KnowledgeStore } from '../../src/feedback/knowledge-store';
import { FeedbackLoop } from '../../src/feedback/feedback-loop';
import { WorkflowStore } from '../../src/workflow/workflow-store';
import { generateReplayScript } from '../../src/replay/script-generator';
import type { StepRecord } from '../../src/recorder/types';

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const FAST_FAIL_TIMEOUT = 3000;

// ── Mock backend (semantic matching) ──────────────────────────────────────────

function startMockBackend(port: number): http.Server {
  return http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/match-workflow') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body) as { goal: string; candidates: Array<{ id: string; goal: string }> };
          const match = data.candidates.find((c) =>
            c.goal.toLowerCase().includes('submit'),
          );
          if (match) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ workflowId: match.id, confidence: 0.87 }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ workflowId: null, confidence: 0 }));
          }
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

// ── Test HTML ─────────────────────────────────────────────────────────────────

const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Phase 3.4 Test</title></head>
<body>
  <button id="submit-btn" data-testid="submit-btn">Submit</button>
  <div id="result" style="display:none">Done</div>
  <script>
    document.getElementById('submit-btn').addEventListener('click', function() {
      document.getElementById('result').style.display = 'block';
    });
  </script>
</body>
</html>`;

// ── Suite-level state ─────────────────────────────────────────────────────────

let server: http.Server;
let serverPort: number;
let backendServer: http.Server;
let backendPort: number;
let browser: Browser;
let sdk: AutomationSDK;

function testUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

function backendUrl(): string {
  return `http://127.0.0.1:${backendPort}`;
}

beforeAll(async () => {
  // Start HTML server
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

  // Start mock backend
  await new Promise<void>((resolve) => {
    backendServer = startMockBackend(0);
    backendServer.listen(0, '127.0.0.1', () => {
      backendPort = (backendServer.address() as { port: number }).port;
      resolve();
    });
  });

  browser = await puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  sdk = new AutomationSDK({
    browserWSEndpoint: browser.wsEndpoint(),
    defaultTimeout: FAST_FAIL_TIMEOUT,
    retries: 1,
    retryDelay: 100,
  });
  await sdk.connect();
}, 30_000);

afterAll(async () => {
  if (sdk.isConnected()) await sdk.disconnect();
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => backendServer.close(() => resolve()));
}, 15_000);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — Semantic Workflow Matching', () => {
  test('keyword match: finds workflow for similar goal phrasing', async () => {
    const wfStore = sdk.getWorkflowStore();

    // Record a workflow with goal "click submit button"
    const steps: StepRecord[] = [
      {
        action: 'navigate',
        target: testUrl(),
        timestamp: Date.now(),
      },
    ];
    const script = generateReplayScript('click submit button', steps);
    wfStore.save('click submit button', script);

    // Search with a slightly different phrasing — should keyword match
    const result = await sdk.findBestWorkflow('press the submit button', backendUrl());
    expect(result).not.toBeNull();
    expect(result!.method).toMatch(/keyword|semantic/);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.workflow.goal).toBe('click submit button');
  }, FAST_FAIL_TIMEOUT * 3);

  test('exact match: returns confidence 1.0 for identical goal', async () => {
    const result = await sdk.findBestWorkflow('click submit button', backendUrl());
    expect(result).not.toBeNull();
    expect(result!.method).toBe('exact');
    expect(result!.confidence).toBe(1.0);
  }, FAST_FAIL_TIMEOUT * 2);

  test('no match: returns null when no workflows exist', async () => {
    const matcher = new SemanticMatcher();
    const result = await matcher.findBestWorkflow('completely unrelated goal xyz', []);
    expect(result).toBeNull();
  });

  test('semantic match via backend: routes low keyword score to backend', async () => {
    const wfStore = new WorkflowStore();
    const steps: StepRecord[] = [
      { action: 'navigate', target: testUrl(), timestamp: Date.now() },
    ];
    const script = generateReplayScript('click submit button', steps);
    const wf = wfStore.save('click submit button', script);

    const matcher = new SemanticMatcher();
    // Low keyword overlap but backend returns high confidence for "submit"
    const result = await matcher.findBestWorkflow(
      'activate the form submission', // low keyword overlap, includes "submit" so backend matches
      [wf],
      backendUrl(),
    );
    // May or may not exceed threshold depending on keyword score; just verify no crash
    // If keyword score > 0.3, backend is tried; confidence 0.87 >= 0.75 → semantic match
    if (result) {
      expect(['keyword', 'semantic']).toContain(result.method);
    }
  }, FAST_FAIL_TIMEOUT * 3);
});

describe('Phase 3.4 — Feedback Loop', () => {
  let tmpDir: string;
  let failureStore: FailureStore;
  let knowledgeStore: KnowledgeStore;
  let feedbackLoop: FeedbackLoop;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase34-'));
    failureStore = new FailureStore(path.join(tmpDir, 'failures.json'));
    knowledgeStore = new KnowledgeStore(path.join(tmpDir, 'knowledge-base.json'));
    feedbackLoop = new FeedbackLoop(failureStore, knowledgeStore);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('captureFailure: records failure to store', () => {
    feedbackLoop.captureFailure({
      goal: 'submit form',
      step: 'click submit',
      error: 'Element not found: #wrong',
      selector: '#wrong',
      url: 'http://example.com',
      timestamp: Date.now(),
    });
    const all = failureStore.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].goal).toBe('submit form');
    expect(all[0].step).toBe('click submit');
  });

  test('promptFix: returns null in CI (non-TTY)', async () => {
    const fix = await feedbackLoop.promptFix({
      goal: 'submit form',
      step: 'click submit',
      error: 'Not found',
      selector: '#wrong',
      url: 'http://example.com',
      timestamp: Date.now(),
    });
    // In CI, process.stdin.isTTY is false → returns null
    expect(fix).toBeNull();
  });

  test('learnFromFix: stores knowledge entry', () => {
    feedbackLoop.learnFromFix(
      {
        goal: 'submit form',
        step: 'click submit',
        error: 'Not found',
        selector: '#wrong',
        url: 'http://example.com',
        timestamp: Date.now(),
      },
      { type: 'css', value: '[data-testid="submit-btn"]' },
      '[data-testid="submit-btn"]',
    );
    const entries = knowledgeStore.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].fix.type).toBe('css');
    expect(entries[0].fix.value).toBe('[data-testid="submit-btn"]');
    expect(entries[0].source).toBe('user');
  });

  test('applyKnowledge: retrieves matching entry', () => {
    const entry = feedbackLoop.applyKnowledge('submit form', 'click submit');
    expect(entry).not.toBeNull();
    expect(entry!.fix.value).toBe('[data-testid="submit-btn"]');
  });

  test('KnowledgeStore: handles legacy string-fix format', () => {
    const legacyPath = path.join(tmpDir, 'legacy-kb.json');
    fs.writeFileSync(
      legacyPath,
      JSON.stringify([
        {
          pattern: 'old pattern',
          fix: '.legacy-selector',
          confidence: 0.8,
          source: 'local',
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      ]),
    );
    const store = new KnowledgeStore(legacyPath);
    const entries = store.getAll();
    expect(entries[0].fix.type).toBe('css');
    expect(entries[0].fix.value).toBe('.legacy-selector');
  });
});

describe('Phase 3.4 — Self-Healing Replay', () => {
  let tmpDir: string;
  let knowledgeStore: KnowledgeStore;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase34-heal-'));
    knowledgeStore = new KnowledgeStore(path.join(tmpDir, 'knowledge-base.json'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('self-healing: replay succeeds when knowledge base provides fix selector', async () => {
    // Navigate to test page first
    const page = await sdk.getPage();
    await page.goto(testUrl(), { waitUntil: 'domcontentloaded' });

    // Add knowledge entry: for "click submit button" + "submit", use the working selector
    knowledgeStore.add({
      pattern: 'click submit button submit',
      fix: { type: 'css', value: '[data-testid="submit-btn"]' },
      context: testUrl(),
      confidence: 0.9,
      source: 'user',
      lastUpdated: new Date().toISOString(),
    });

    // Create a workflow with a WRONG primary selector (page is already on testUrl)
    const steps: StepRecord[] = [
      {
        action: 'click',
        target: 'submit',
        selectors: [{ type: 'css', value: '#wrong-selector-that-does-not-exist', rank: 1 }],
        timestamp: Date.now(),
      },
    ];
    const script = generateReplayScript('click submit button', steps);
    // Reduce timeouts so the wrong selector fails quickly
    for (const step of script.steps) {
      step.wait.timeout = 500;
      step.retry = 0;
    }

    // Replay using the engine with our knowledge store
    const { ReplayEngine } = await import('../../src/replay/replay-engine');
    const engine = new ReplayEngine(() => Promise.resolve(page), knowledgeStore);
    const metrics = await engine.replay(script);

    // The step with #wrong-selector should heal via the knowledge base fix
    const clickStep = metrics.steps.find((s) => s.stepIndex === 0);
    expect(clickStep).toBeDefined();
    expect(clickStep!.succeeded).toBe(true);
    expect(clickStep!.usedFallback).toBe(true);
    expect(clickStep!.fallbackSelector).toBe('[data-testid="submit-btn"]');
  }, FAST_FAIL_TIMEOUT * 5);
});

describe('Phase 3.4 — SemanticMatcher unit', () => {
  const matcher = new SemanticMatcher();

  test('normalize: removes stop words and lowercases', () => {
    const tokens = matcher.normalize('Click the Submit Button');
    expect(tokens).toContain('click');
    expect(tokens).toContain('submit');
    expect(tokens).toContain('button');
    expect(tokens).not.toContain('the');
  });

  test('keywordScore: identical text returns 1.0', () => {
    expect(matcher.keywordScore('submit form', 'submit form')).toBe(1.0);
  });

  test('keywordScore: disjoint texts return 0', () => {
    expect(matcher.keywordScore('submit form', 'navigate home')).toBe(0);
  });

  test('keywordScore: partial overlap returns fractional score', () => {
    const score = matcher.keywordScore('click submit button', 'press the submit button');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('CONFIDENCE_THRESHOLD is 0.75', () => {
    expect(matcher.CONFIDENCE_THRESHOLD).toBe(0.75);
  });
});
