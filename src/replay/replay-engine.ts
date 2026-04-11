import type { Page } from 'puppeteer-core';
import { ReplayScript, ReplayStep, RunMetrics, StepMetrics } from './types';
import { stabilizeBefore, stabilizeDuring, stabilizeAfter } from './stabilization';
import { resolveSelector } from '../selectors/selector-engine';
import type { KnowledgeStore } from '../feedback/knowledge-store';

function generateRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Deterministic replay engine — no LLM required.
 * Tries the primary selector first then falls back through the fallback list.
 */
export class ReplayEngine {
  constructor(
    private getPage: () => Promise<Page>,
    private knowledgeStore?: KnowledgeStore,
  ) {}

  async replay(script: ReplayScript): Promise<RunMetrics> {
    const runId = generateRunId();
    const startedAt = Date.now();
    const stepMetrics: StepMetrics[] = [];
    let overallSuccess = true;

    for (let i = 0; i < script.steps.length; i++) {
      const metric = await this.executeStep(script.steps[i], i, script.goal);
      stepMetrics.push(metric);
      if (!metric.succeeded) {
        overallSuccess = false;
        break;
      }
    }

    return {
      workflowId: script.id,
      runId,
      startedAt,
      finishedAt: Date.now(),
      succeeded: overallSuccess,
      steps: stepMetrics,
    };
  }

  private async executeStep(step: ReplayStep, index: number, goal = ''): Promise<StepMetrics> {
    const stepStart = Date.now();
    const page = await this.getPage();

    if (step.selector.primary) {
      await stabilizeBefore(page, step.selector.primary, {
        timeout: step.wait.timeout,
      }).catch(() => {});
    }

    const selectors = [step.selector.primary, ...step.selector.fallbacks].filter(Boolean);
    let succeeded = false;
    let usedFallback = false;
    let attempts = 0;
    let activeSelector = step.selector.primary;

    for (let si = 0; si < selectors.length; si++) {
      const sel = selectors[si];
      if (!sel) continue;

      try {
        await stabilizeDuring(
          async () => {
            attempts++;
            activeSelector = sel;
            await this.performAction(page, step, sel);
          },
          { retries: step.retry },
        );
        if (si > 0) usedFallback = true;
        succeeded = true;
        break;
      } catch {
        // try next fallback
      }
    }

    if (succeeded && step.wait.after) {
      await stabilizeAfter(page, step.wait.after, { timeout: step.wait.timeout }).catch(() => {});
    }

    if (!succeeded && this.knowledgeStore) {
      const entry = this.knowledgeStore.match(goal, step.target ?? '');
      if (entry && entry.fix.type !== 'skip') {
        const fixSel = entry.fix.value;
        try {
          await stabilizeDuring(
            async () => {
              attempts++;
              activeSelector = fixSel;
              await this.performAction(page, step, fixSel);
            },
            { retries: step.retry },
          );
          succeeded = true;
          usedFallback = true;
          if (!step.selector.fallbacks.includes(fixSel)) {
            step.selector.fallbacks.push(fixSel);
          }
        } catch {
          // fix also failed
        }
      }
    }

    return {
      stepIndex: index,
      selector: step.selector.primary,
      attempts,
      succeeded,
      usedFallback,
      fallbackSelector: usedFallback ? activeSelector : undefined,
      durationMs: Date.now() - stepStart,
    };
  }

  private async performAction(page: Page, step: ReplayStep, selector: string): Promise<void> {
    const timeout = step.wait.timeout ?? 10000;

    switch (step.action) {
      case 'navigate':
        await page.goto(step.target ?? selector, { waitUntil: 'domcontentloaded', timeout });
        break;
      case 'click': {
        const el = await resolveSelector(page, selector, { timeout });
        await el.click();
        break;
      }
      case 'type': {
        const el = await resolveSelector(page, selector, { timeout });
        await el.click({ clickCount: 3 });
        await el.type(step.value ?? '');
        break;
      }
      case 'select':
        await page.select(selector, step.value ?? '');
        break;
      case 'check': {
        const el = await resolveSelector(page, selector, { timeout });
        await el.click();
        break;
      }
      case 'scroll':
        await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, selector);
        break;
      default:
        break;
    }
  }
}
