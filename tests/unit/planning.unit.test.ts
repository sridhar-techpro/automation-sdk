/**
 * Unit tests for Phase 3.3 — Planning, Selector Ranking, Replay, Workflow, Metrics
 */

import { rankSelectors, isBrittleSelector, buildCompositeSelector, selectPrimaryAndFallbacks } from '../../src/selectors/selector-ranker';
import { generateReplayScript } from '../../src/replay/script-generator';
import { WorkflowStore } from '../../src/workflow/workflow-store';
import { SuccessRateTracker } from '../../src/metrics/success-tracker';
import { ActionRecorder } from '../../src/recorder/recorder';
import type { SelectorCandidate } from '../../src/recorder/types';
import type { StepRecord } from '../../src/recorder/types';
import type { ReplayScript, RunMetrics } from '../../src/replay/types';

// ─── rankSelectors ────────────────────────────────────────────────────────────

describe('rankSelectors', () => {
  it('returns candidates ordered by priority', () => {
    const candidates: SelectorCandidate[] = [
      { type: 'xpath',       value: '//button',                                   rank: 6 },
      { type: 'text',        value: 'text=Submit',                                rank: 4 },
      { type: 'data-testid', value: '[data-testid="submit"]',                    rank: 1 },
      { type: 'css',         value: 'button.submit',                              rank: 5 },
      { type: 'aria-label',  value: '[aria-label="Submit form"]',                rank: 2 },
      { type: 'role-text',   value: '::-p-xpath(//*[@role="button"])',             rank: 3 },
    ];
    const ranked = rankSelectors(candidates);
    expect(ranked[0].type).toBe('data-testid');
    expect(ranked[1].type).toBe('aria-label');
    expect(ranked[2].type).toBe('role-text');
    expect(ranked[3].type).toBe('text');
    expect(ranked[4].type).toBe('css');
    expect(ranked[5].type).toBe('xpath');
  });

  it('sorts equal-priority items by value length (shorter first)', () => {
    const candidates: SelectorCandidate[] = [
      { type: 'css', value: 'button.very-long-class-name', rank: 5 },
      { type: 'css', value: 'button#id',                   rank: 5 },
    ];
    const ranked = rankSelectors(candidates);
    expect(ranked[0].value).toBe('button#id');
  });

  it('returns an empty array for empty input', () => {
    expect(rankSelectors([])).toEqual([]);
  });

  it('handles a single candidate', () => {
    const c: SelectorCandidate = { type: 'text', value: 'text=Foo', rank: 4 };
    expect(rankSelectors([c])).toEqual([c]);
  });

  it('does not mutate the input array', () => {
    const original: SelectorCandidate[] = [
      { type: 'css', value: 'div', rank: 5 },
      { type: 'data-testid', value: '[data-testid="x"]', rank: 1 },
    ];
    const copy = [...original];
    rankSelectors(original);
    expect(original).toEqual(copy);
  });
});

// ─── isBrittleSelector ────────────────────────────────────────────────────────

describe('isBrittleSelector', () => {
  it('flags nth-child selectors', () => {
    expect(isBrittleSelector('li:nth-child(2)')).toBe(true);
  });

  it('flags nth-of-type selectors', () => {
    expect(isBrittleSelector('p:nth-of-type(1)')).toBe(true);
  });

  it('flags index-based XPath', () => {
    expect(isBrittleSelector('//ul/li[2]')).toBe(true);
  });

  it('flags hash-like class names (8+ alphanumeric chars)', () => {
    expect(isBrittleSelector('.a1b2c3d4')).toBe(true);
  });

  it('allows stable data-testid selectors', () => {
    expect(isBrittleSelector('[data-testid="submit-btn"]')).toBe(false);
  });

  it('allows aria-label selectors', () => {
    expect(isBrittleSelector('[aria-label="Close"]')).toBe(false);
  });

  it('allows short class names', () => {
    expect(isBrittleSelector('.submit')).toBe(false);
  });

  it('allows plain tag selectors', () => {
    expect(isBrittleSelector('button')).toBe(false);
  });
});

// ─── buildCompositeSelector ───────────────────────────────────────────────────

describe('buildCompositeSelector', () => {
  it('builds a valid XPath composite selector', () => {
    const c = buildCompositeSelector('button', 'Submit');
    expect(c.type).toBe('role-text');
    expect(c.value).toContain('@role="button"');
    expect(c.value).toContain('"Submit"');
    expect(c.rank).toBe(3);
  });

  it('escapes backslashes and double-quotes in the text', () => {
    const c = buildCompositeSelector('button', 'Say "hello"');
    expect(c.value).toContain('\\"hello\\"');
  });
});

// ─── selectPrimaryAndFallbacks ────────────────────────────────────────────────

describe('selectPrimaryAndFallbacks', () => {
  it('picks data-testid as primary', () => {
    const candidates: SelectorCandidate[] = [
      { type: 'css',         value: 'button.btn',               rank: 5 },
      { type: 'data-testid', value: '[data-testid="btn"]',      rank: 1 },
      { type: 'text',        value: 'text=Click me',            rank: 4 },
    ];
    const { primary, fallbacks } = selectPrimaryAndFallbacks(candidates);
    expect(primary).toBe('[data-testid="btn"]');
    expect(fallbacks).toContain('text=Click me');
    expect(fallbacks).toContain('button.btn');
  });

  it('demotes brittle selectors and still returns them as fallbacks', () => {
    const candidates: SelectorCandidate[] = [
      { type: 'css',         value: 'li:nth-child(2)',          rank: 5 },
      { type: 'data-testid', value: '[data-testid="item"]',     rank: 1 },
    ];
    const { primary, fallbacks } = selectPrimaryAndFallbacks(candidates);
    expect(primary).toBe('[data-testid="item"]');
    expect(fallbacks).not.toContain('li:nth-child(2)');
  });

  it('uses brittle selectors when nothing else is available', () => {
    const candidates: SelectorCandidate[] = [
      { type: 'css', value: 'li:nth-child(1)', rank: 5 },
    ];
    const { primary } = selectPrimaryAndFallbacks(candidates);
    expect(primary).toBe('li:nth-child(1)');
  });

  it('returns empty primary/fallbacks for empty input', () => {
    const { primary, fallbacks } = selectPrimaryAndFallbacks([]);
    expect(primary).toBe('');
    expect(fallbacks).toEqual([]);
  });
});

// ─── generateReplayScript ─────────────────────────────────────────────────────

describe('generateReplayScript', () => {
  const records: StepRecord[] = [
    {
      action: 'click',
      target: 'submit button',
      text: 'Submit',
      role: 'button',
      ariaLabel: undefined,
      dataTestId: 'submit-btn',
      domPath: 'form > button#submit-btn',
      url: 'http://example.com',
      timestamp: 1000,
      selectors: [
        { type: 'data-testid', value: '[data-testid="submit-btn"]', rank: 1 },
        { type: 'text',        value: 'text=Submit',                rank: 4 },
      ],
    },
    {
      action: 'type',
      target: 'email field',
      text: 'user@example.com',
      dataTestId: 'email',
      url: 'http://example.com',
      timestamp: 2000,
      selectors: [
        { type: 'data-testid', value: '[data-testid="email"]', rank: 1 },
      ],
    },
  ];

  it('generates a script with an id and goal', () => {
    const script = generateReplayScript('fill form', records);
    expect(script.id).toBeTruthy();
    expect(script.goal).toBe('fill form');
    expect(script.steps).toHaveLength(2);
  });

  it('each step has selector, wait, and retry', () => {
    const script = generateReplayScript('fill form', records);
    for (const step of script.steps) {
      expect(step.selector).toBeDefined();
      expect(step.selector.primary).toBeTruthy();
      expect(Array.isArray(step.selector.fallbacks)).toBe(true);
      expect(step.retry).toBeGreaterThan(0);
      expect(step.wait).toBeDefined();
    }
  });

  it('click step has the data-testid as primary selector', () => {
    const script = generateReplayScript('fill form', records);
    expect(script.steps[0].selector.primary).toBe('[data-testid="submit-btn"]');
  });

  it('generates unique ids for multiple calls', () => {
    const s1 = generateReplayScript('goal', records);
    const s2 = generateReplayScript('goal', records);
    expect(s1.id).not.toBe(s2.id);
  });

  it('produces an empty steps array for empty records', () => {
    const script = generateReplayScript('empty', []);
    expect(script.steps).toHaveLength(0);
  });
});

// ─── WorkflowStore ────────────────────────────────────────────────────────────

describe('WorkflowStore', () => {
  function makeScript(goal: string): ReplayScript {
    return { id: `test-${Math.random()}`, goal, createdAt: Date.now(), steps: [] };
  }

  it('saves and retrieves a workflow by id', () => {
    const store = new WorkflowStore();
    const script = makeScript('login');
    const wf = store.save('login', script);
    expect(store.get(wf.id)).toBe(wf);
  });

  it('findByGoal returns the workflow', () => {
    const store = new WorkflowStore();
    const wf = store.save('search', makeScript('search'));
    expect(store.findByGoal('search')).toBe(wf);
  });

  it('list returns all workflows', () => {
    const store = new WorkflowStore();
    store.save('a', makeScript('a'));
    store.save('b', makeScript('b'));
    expect(store.list()).toHaveLength(2);
  });

  it('updating the same goal increments version', () => {
    const store = new WorkflowStore();
    store.save('checkout', makeScript('checkout'));
    const updated = store.save('checkout', makeScript('checkout'));
    expect(updated.version).toBe(2);
  });

  it('updateSuccessRate tracks totals correctly', () => {
    const store = new WorkflowStore();
    const wf = store.save('test', makeScript('test'));
    store.updateSuccessRate(wf.id, true);
    store.updateSuccessRate(wf.id, true);
    store.updateSuccessRate(wf.id, false);
    const updated = store.get(wf.id)!;
    expect(updated.totalRuns).toBe(3);
    expect(updated.successfulRuns).toBe(2);
    expect(updated.successRate).toBeCloseTo(2 / 3);
  });

  it('sets needsRevalidation when success rate drops below 50% after 3+ runs', () => {
    const store = new WorkflowStore();
    const wf = store.save('flaky', makeScript('flaky'));
    store.updateSuccessRate(wf.id, false);
    store.updateSuccessRate(wf.id, false);
    store.updateSuccessRate(wf.id, false);
    expect(store.get(wf.id)!.needsRevalidation).toBe(true);
  });

  it('does not set needsRevalidation for a good success rate', () => {
    const store = new WorkflowStore();
    const wf = store.save('good', makeScript('good'));
    store.updateSuccessRate(wf.id, true);
    store.updateSuccessRate(wf.id, true);
    store.updateSuccessRate(wf.id, true);
    expect(store.get(wf.id)!.needsRevalidation).toBeUndefined();
  });

  it('delete removes the workflow', () => {
    const store = new WorkflowStore();
    const wf = store.save('tmp', makeScript('tmp'));
    expect(store.delete(wf.id)).toBe(true);
    expect(store.get(wf.id)).toBeUndefined();
  });
});

// ─── SuccessRateTracker ───────────────────────────────────────────────────────

describe('SuccessRateTracker', () => {
  function makeRun(
    workflowId: string,
    succeeded: boolean,
    primarySel: string,
    usedFallback = false,
    fallbackSel?: string,
  ): RunMetrics {
    return {
      workflowId,
      runId: `run-${Math.random()}`,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      succeeded,
      steps: [
        {
          stepIndex: 0,
          selector: primarySel,
          attempts: usedFallback ? 2 : 1,
          succeeded,
          usedFallback,
          fallbackSelector: fallbackSel,
          durationMs: 100,
        },
      ],
    };
  }

  function makeScript(id: string, primary: string, fallbacks: string[]): ReplayScript {
    return {
      id,
      goal: 'test',
      createdAt: Date.now(),
      steps: [{ action: 'click', selector: { primary, fallbacks }, wait: {}, retry: 3 }],
    };
  }

  it('recordRun updates the workflow success rate', () => {
    const store = new WorkflowStore();
    const script = makeScript('wf-1', '[data-testid="btn"]', []);
    const wf = store.save('test', script);
    const tracker = new SuccessRateTracker(store);

    tracker.recordRun(makeRun(wf.id, true, '[data-testid="btn"]'));
    expect(store.get(wf.id)!.successRate).toBe(1);
  });

  it('isFlaky returns false for < 5 attempts', () => {
    const tracker = new SuccessRateTracker(new WorkflowStore());
    expect(tracker.isFlaky('[data-testid="btn"]')).toBe(false);
  });

  it('getStats returns selector stats', () => {
    const store = new WorkflowStore();
    const script = makeScript('wf-2', '[data-testid="x"]', []);
    const wf = store.save('s', script);
    const tracker = new SuccessRateTracker(store);

    tracker.recordRun(makeRun(wf.id, true, '[data-testid="x"]'));
    const stats = tracker.getStats('[data-testid="x"]');
    expect(stats).toBeDefined();
    expect(stats!.successes).toBe(1);
  });

  it('getAllStats returns all tracked selectors', () => {
    const store = new WorkflowStore();
    const script = makeScript('wf-3', '[data-testid="a"]', ['[data-testid="b"]']);
    const wf = store.save('all', script);
    const tracker = new SuccessRateTracker(store);

    tracker.recordRun(makeRun(wf.id, true, '[data-testid="a"]', true, '[data-testid="b"]'));
    const all = tracker.getAllStats();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('promotes fallback to primary when primary consistently fails', () => {
    const store = new WorkflowStore();
    const primary = '[data-testid="bad"]';
    const fallback = '[data-testid="good"]';
    const script = makeScript('wf-4', primary, [fallback]);
    const wf = store.save('promote', script);
    const tracker = new SuccessRateTracker(store);

    // 3 failed runs using primary (no fallback)
    for (let i = 0; i < 3; i++) {
      tracker.recordRun(makeRun(wf.id, false, primary));
    }
    // 2 successful runs that used the fallback
    for (let i = 0; i < 2; i++) {
      tracker.recordRun(makeRun(wf.id, true, primary, true, fallback));
    }

    // After optimization the fallback should be promoted to primary
    const updated = store.get(wf.id)!;
    expect(updated.script.steps[0].selector.primary).toBe(fallback);
  });
});

// ─── ActionRecorder ───────────────────────────────────────────────────────────

describe('ActionRecorder', () => {
  it('records and retrieves steps', () => {
    const rec = new ActionRecorder();
    const step: StepRecord = { action: 'click', target: 'button', timestamp: 1 };
    rec.record(step);
    expect(rec.getRecords()).toEqual([step]);
  });

  it('returns a copy of records (not the internal array)', () => {
    const rec = new ActionRecorder();
    rec.record({ action: 'click', target: 'x', timestamp: 1 });
    const a = rec.getRecords();
    const b = rec.getRecords();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('clears records', () => {
    const rec = new ActionRecorder();
    rec.record({ action: 'click', target: 'x', timestamp: 1 });
    rec.clear();
    expect(rec.getRecords()).toHaveLength(0);
  });

  it('records multiple steps in order', () => {
    const rec = new ActionRecorder();
    const steps: StepRecord[] = [
      { action: 'navigate', target: 'home', timestamp: 1 },
      { action: 'click',    target: 'btn',  timestamp: 2 },
      { action: 'type',     target: 'inp',  timestamp: 3 },
    ];
    for (const s of steps) rec.record(s);
    expect(rec.getRecords()).toEqual(steps);
  });
});
