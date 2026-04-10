/**
 * scripts/validate.ts
 *
 * Validation pipeline for the AI-Native Automation SDK.
 *
 * Creates a timestamped validation bundle under validation/run-<timestamp>/:
 *   system-info.json   — Node version, platform, timestamp
 *   test-results.log   — Jest output + pass/fail summary
 *   goal-results.json  — Per-scenario executeGoal output
 *   summary.md         — Human-readable summary
 *   errors.log         — Failures (only written when there are errors)
 *
 * Run via:  node_modules/.bin/ts-node --project tsconfig.scripts.json scripts/validate.ts
 * Or via:   pnpm validate  (after adding the script to package.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import * as puppeteer from 'puppeteer-core';
import type { Browser, HTTPRequest } from 'puppeteer-core';
import { AutomationSDK } from '../src/core/sdk';
import type { GoalResult } from '../src/ai/types';
import scenarios from '../validation/test-scenarios.json';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Mock HTML served in place of real amazon.in / flipkart.com responses during
 * SEARCH_PRODUCT goal scenarios.  Deterministic product list that exercises the
 * full filter+aggregate pipeline.
 */
const MOCK_PRODUCT_HTML = `<!DOCTYPE html>
<html>
<head><title>Search Results</title></head>
<body>
<article class="product-item">
  <span class="product-title">Samsung Galaxy S23</span>
  <span class="product-price">28000</span>
  <span class="product-rating">4.5</span>
</article>
<article class="product-item">
  <span class="product-title">OnePlus 12</span>
  <span class="product-price">32000</span>
  <span class="product-rating">4.6</span>
</article>
<article class="product-item">
  <span class="product-title">Pixel 8a</span>
  <span class="product-price">25000</span>
  <span class="product-rating">4.3</span>
</article>
<article class="product-item">
  <span class="product-title">Redmi Note 13</span>
  <span class="product-price">18000</span>
  <span class="product-rating">3.8</span>
</article>
</body>
</html>`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScenarioRecord {
  input: string;
  result: GoalResult | null;
  success: boolean;
  error: string | null;
  durationMs: number;
}

interface TestRunResult {
  passed: boolean;
  output: string;
  durationMs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ISO-8601 timestamp safe for use as a directory name (colons replaced). */
function makeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Creates a directory and all parents.  Returns the path. */
function mkdirp(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Writes text content to a file, creating parent dirs as needed. */
function writeFile(filePath: string, content: string): void {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

/** Formats a duration in milliseconds as a human-readable string. */
function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Returns true when the URL belongs to one of the mock-intercepted hostnames.
 * Uses URL parsing to avoid substring-sanitization issues.
 */
function isSearchSiteUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return hostname === 'www.amazon.in'    || hostname === 'amazon.in' ||
           hostname === 'www.flipkart.com' || hostname === 'flipkart.com';
  } catch {
    return false;
  }
}

// ─── Step 1: Collect system info ──────────────────────────────────────────────

function collectSystemInfo(timestamp: string): Record<string, string> {
  let npmVersion = 'unknown';
  try {
    npmVersion = cp.execSync('npm --version', { encoding: 'utf8' }).trim();
  } catch { /* ignore */ }

  return {
    timestamp,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.arch()} ${os.release()}`,
    npmVersion,
  };
}

// ─── Step 2: Run Jest tests ───────────────────────────────────────────────────

function runJestTests(): TestRunResult {
  const start = Date.now();
  console.log('  ↳ Running jest test suites…');

  const jestBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'jest');

  // Run each suite individually to avoid Chrome resource contention when
  // multiple E2E suites share the same Jest worker pool.
  const suites = [
    { label: 'unit',        pattern: 'tests/unit',                          timeout: 60_000  },
    { label: 'e2e:sdk',     pattern: 'tests/e2e/sdk.e2e.test.ts',           timeout: 180_000 },
    { label: 'e2e:phase2',  pattern: 'tests/e2e/phase2.e2e.test.ts',        timeout: 120_000 },
    { label: 'e2e:goal',    pattern: 'tests/e2e/goal.e2e.test.ts',          timeout: 120_000 },
    { label: 'e2e:phase3-hardening', pattern: 'tests/e2e/phase3-hardening.e2e.test.ts', timeout: 120_000 },
    { label: 'e2e:ui-coverage',      pattern: 'tests/e2e/ui-coverage.e2e.test.ts',       timeout: 120_000 },
    { label: 'e2e:reliability-engine', pattern: 'tests/e2e/reliability-engine.e2e.test.ts', timeout: 180_000 },
    { label: 'e2e:replay',             pattern: 'tests/e2e/replay.e2e.test.ts',             timeout: 180_000 },
  ];

  let combinedOutput = '';
  let passed = true;

  for (const suite of suites) {
    console.log(`  ↳ [${suite.label}] running…`);
    const result = cp.spawnSync(
      jestBin,
      [suite.pattern, '--runInBand', '--forceExit', '--verbose'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: suite.timeout,
        env: { ...process.env, CI: '1' },
      },
    );

    const out = [result.stdout ?? '', result.stderr ?? ''].join('\n').trim();
    combinedOutput += `\n\n=== ${suite.label.toUpperCase()} ===\n` + out;

    if (result.status !== 0) {
      passed = false;
      console.log(`  ↳ [${suite.label}] FAILED ✗`);
    } else {
      console.log(`  ↳ [${suite.label}] passed ✓`);
    }
  }

  const durationMs = Date.now() - start;
  console.log(`  ↳ Jest finished in ${fmtMs(durationMs)} — ${passed ? 'PASSED ✓' : 'FAILED ✗'}`);
  return { passed, output: combinedOutput.trim(), durationMs };
}

// ─── Step 3: Run goal scenarios ───────────────────────────────────────────────

/** Enables request interception on the SDK page for the duration of a callback. */
async function withSearchInterception<T>(
  sdk: AutomationSDK,
  action: () => Promise<T>,
): Promise<T> {
  const page = await sdk.getPage();
  await page.setRequestInterception(true);

  const handler = (req: HTTPRequest): void => {
    if (isSearchSiteUrl(req.url())) {
      void req.respond({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: MOCK_PRODUCT_HTML,
      });
    } else {
      void req.continue();
    }
  };

  page.on('request', handler);
  try {
    return await action();
  } finally {
    page.off('request', handler);
    await page.setRequestInterception(false);
  }
}

async function runGoalScenarios(sdk: AutomationSDK): Promise<ScenarioRecord[]> {
  const records: ScenarioRecord[] = [];

  for (const input of scenarios as string[]) {
    console.log(`  ↳ Scenario: "${input}"`);
    const start = Date.now();
    try {
      // Always enable interception; non-search intents have empty steps so
      // no requests are made and the handler is a no-op for them.
      const result = await withSearchInterception(sdk, () =>
        sdk.executeGoal(input),
      );
      const durationMs = Date.now() - start;
      console.log(`     ✓ success (${fmtMs(durationMs)}) — topProducts: ${result.topProducts.length}`);
      records.push({ input, result, success: true, error: null, durationMs });
    } catch (err) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);
      console.log(`     ✗ failed  (${fmtMs(durationMs)}) — ${error}`);
      records.push({ input, result: null, success: false, error, durationMs });
    }
  }

  return records;
}

// ─── Step 4: Build summary ────────────────────────────────────────────────────

/**
 * Aggregates Jest statistics by summing the numeric values across all suite
 * runs in `jestOutput`.  Returns a human-readable string like "3 passed, 3 total".
 */
function sumJestStat(jestOutput: string, pattern: RegExp): string {
  const matches = [...jestOutput.matchAll(pattern)];
  if (matches.length === 0) return 'unknown';
  let passed = 0, failed = 0, total = 0;
  for (const m of matches) {
    const passedM = /(\d+)\s+passed/.exec(m[1]);
    const failedM = /(\d+)\s+failed/.exec(m[1]);
    const totalM  = /(\d+)\s+total/.exec(m[1]);
    if (passedM) passed += parseInt(passedM[1], 10);
    if (failedM) failed += parseInt(failedM[1], 10);
    if (totalM)  total  += parseInt(totalM[1],  10);
  }
  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed`);
  if (passed > 0) parts.push(`${passed} passed`);
  if (total > 0)  parts.push(`${total} total`);
  return parts.join(', ') || 'unknown';
}

function buildSummary(
  timestamp: string,
  jestResult: TestRunResult,
  scenarios: ScenarioRecord[],
  totalMs: number,
): string {
  const scenarioPassed = scenarios.filter(s => s.success).length;
  const scenarioFailed = scenarios.filter(s => !s.success).length;

  const totalSuites = sumJestStat(jestResult.output, /Test Suites:\s+(.+)/g);
  const totalTests  = sumJestStat(jestResult.output, /Tests:\s+(.+)/g);

  const lines: string[] = [
    '# Validation Summary',
    '',
    `**Timestamp:** ${timestamp}`,
    `**Total duration:** ${fmtMs(totalMs)}`,
    '',
    '## Jest Test Results',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Status | ${jestResult.passed ? '✅ PASSED' : '❌ FAILED'} |`,
    `| Duration | ${fmtMs(jestResult.durationMs)} |`,
    `| Suites | ${totalSuites} |`,
    `| Tests | ${totalTests} |`,
    '',
    '## Goal Scenarios',
    '',
    `| # | Input | Status | Duration |`,
    `|---|-------|--------|----------|`,
    ...scenarios.map((s, i) =>
      `| ${i + 1} | ${s.input} | ${s.success ? '✅' : '❌'} | ${fmtMs(s.durationMs)} |`,
    ),
    '',
    `**Scenarios passed:** ${scenarioPassed} / ${scenarios.length}`,
    `**Scenarios failed:** ${scenarioFailed}`,
    '',
  ];

  if (scenarioFailed > 0) {
    lines.push('## Failures', '');
    for (const s of scenarios.filter(r => !r.success)) {
      lines.push(`- \`${s.input}\`: ${s.error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Step 4b: Build docs/VALIDATION.md ───────────────────────────────────────

/**
 * Produces the full content for docs/VALIDATION.md from the current run's data.
 * The file is overwritten on every `pnpm validate` run so it always reflects the
 * most recent results.  Historical run bundles are preserved under validation/run-*.
 */
function buildValidationDoc(
  timestamp: string,
  jestResult: TestRunResult,
  scenarioRecords: ScenarioRecord[],
  totalMs: number,
): string {
  const scenarioPassed = scenarioRecords.filter(s => s.success).length;

  const totalSuites = sumJestStat(jestResult.output, /Test Suites:\s+(.+)/g);
  const totalTests  = sumJestStat(jestResult.output, /Tests:\s+(.+)/g);
  const overallStatus = jestResult.passed && scenarioPassed === scenarioRecords.length
    ? '✅ PASSED'
    : '❌ FAILED';

  const lines: string[] = [
    '# Validation Tracker',
    '',
    '> This file is automatically updated by `pnpm validate` after every validation run.',
    '> Full run bundles (system-info, test-results, goal-results) are stored under `validation/run-<timestamp>/`.',
    '',
    '---',
    '',
    '## Latest Run',
    '',
    `<!-- AUTO-UPDATED by scripts/validate.ts on ${timestamp} -->`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Timestamp** | ${timestamp} |`,
    `| **Overall status** | ${overallStatus} |`,
    `| **Total duration** | ${fmtMs(totalMs)} |`,
    `| **Test suites** | ${totalSuites} |`,
    `| **Tests** | ${totalTests} |`,
    `| **Goal scenarios** | ${scenarioPassed} / ${scenarioRecords.length} passed |`,
    '',
    '### Goal Scenarios',
    '',
    '| # | Input | Status | Duration |',
    '|---|-------|--------|----------|',
    ...scenarioRecords.map((s, i) =>
      `| ${i + 1} | ${s.input} | ${s.success ? '✅' : '❌'} | ${fmtMs(s.durationMs)} |`,
    ),
    '',
  ];

  if (scenarioRecords.some(s => !s.success)) {
    lines.push('### Failures', '');
    for (const s of scenarioRecords.filter(r => !r.success)) {
      lines.push(`- \`${s.input}\`: ${s.error}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## Test Suite Coverage',
    '',
    '| Suite | File | Type |',
    '|-------|------|------|',
    '| Unit — AI | `tests/unit/ai.unit.test.ts` | Unit |',
    '| Unit — Phase 2 | `tests/unit/phase2.unit.test.ts` | Unit |',
    '| Unit — Selectors | `tests/unit/selectors.unit.test.ts` | Unit |',
    '| E2E — SDK core | `tests/e2e/sdk.e2e.test.ts` | E2E |',
    '| E2E — Phase 2 | `tests/e2e/phase2.e2e.test.ts` | E2E |',
    '| E2E — Goal | `tests/e2e/goal.e2e.test.ts` | E2E |',
    '| E2E — Phase 3 Hardening | `tests/e2e/phase3-hardening.e2e.test.ts` | E2E |',
    '',
    '---',
    '',
    '## Known Issues',
    '',
    '### Flaky Behaviour',
    '',
    '| Issue | Mitigation |',
    '|-------|------------|',
    '| `page.bringToFront()` destroys sibling execution contexts in headless Chrome | Use `page.evaluate()` to simulate focus |',
    '| First `req.abort()` on cold browser can reset interception state | Warmup intercepted navigation in `beforeAll` |',
    '| Multiple Chrome instances competing for resources | Run suites sequentially with `--runInBand` |',
    '',
    '> See `docs/TRACEABILITY.md` for full scenario → feature mapping.',
    '',
  );

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const totalStart = Date.now();
  const timestamp  = makeTimestamp();
  const runDir     = path.join(REPO_ROOT, 'validation', `run-${timestamp}`);

  mkdirp(runDir);
  console.log(`\n🚀 Validation run: ${runDir}\n`);

  // ── 1. System info ──────────────────────────────────────────────────────────
  console.log('📋 Collecting system info…');
  const sysInfo = collectSystemInfo(timestamp);
  writeFile(path.join(runDir, 'system-info.json'), JSON.stringify(sysInfo, null, 2));

  // ── 2. Jest tests ───────────────────────────────────────────────────────────
  console.log('\n🧪 Running jest tests…');
  const jestResult = runJestTests();
  writeFile(path.join(runDir, 'test-results.log'), jestResult.output);

  // ── 3. Goal scenarios (real SDK + real browser + mock interception) ─────────
  console.log('\n🎯 Running goal scenarios…');

  let browser: Browser | null = null;
  let sdk: AutomationSDK | null = null;
  let scenarioRecords: ScenarioRecord[] = [];
  const scenarioErrors: string[] = [];

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_EXECUTABLE,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    sdk = new AutomationSDK({
      browserWSEndpoint: browser.wsEndpoint(),
      defaultTimeout: 15000,
      retries: 1,
      retryDelay: 200,
    });
    await sdk.connect();

    scenarioRecords = await runGoalScenarios(sdk);

    for (const r of scenarioRecords.filter(r => !r.success)) {
      scenarioErrors.push(`[${r.input}] ${r.error}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('  ✗ Fatal error during scenario execution:', msg);
    scenarioErrors.push(`Fatal: ${msg}`);
  } finally {
    try { await sdk?.disconnect(); }  catch { /* ignore */ }
    try { await browser?.close(); }   catch { /* ignore */ }
  }

  // ── 4. Write goal-results.json ──────────────────────────────────────────────
  writeFile(
    path.join(runDir, 'goal-results.json'),
    JSON.stringify(scenarioRecords, null, 2),
  );

  // ── 5. Write errors.log (only when there are errors) ───────────────────────
  const allErrors = [
    ...(!jestResult.passed ? ['Jest tests failed — see test-results.log for details'] : []),
    ...scenarioErrors,
  ];

  if (allErrors.length > 0) {
    writeFile(path.join(runDir, 'errors.log'), allErrors.join('\n') + '\n');
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  const totalMs = Date.now() - totalStart;
  const summary = buildSummary(timestamp, jestResult, scenarioRecords, totalMs);
  writeFile(path.join(runDir, 'summary.md'), summary);

  // ── 7. Print summary ────────────────────────────────────────────────────────
  console.log('\n' + summary);
  console.log(`📁 Validation bundle: ${runDir}\n`);

  // ── 7b. Update docs/VALIDATION.md ───────────────────────────────────────────
  const validationDoc = buildValidationDoc(timestamp, jestResult, scenarioRecords, totalMs);
  writeFile(path.join(REPO_ROOT, 'docs', 'VALIDATION.md'), validationDoc);
  console.log('📄 docs/VALIDATION.md updated\n');

  // Exit with non-zero code if any validation step failed
  const overallSuccess = jestResult.passed && allErrors.length === 0;
  process.exitCode = overallSuccess ? 0 : 1;
}

main().catch(err => {
  console.error('Unhandled error in validate.ts:', err);
  process.exitCode = 1;
});
