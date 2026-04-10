import { RunMetrics, StepMetrics, WorkflowRecord } from '../replay/types';
import { WorkflowStore } from '../workflow/workflow-store';

export interface SelectorStats {
  selector: string;
  attempts: number;
  successes: number;
  failures: number;
}

/**
 * Tracks step-level success/failure metrics and promotes/demotes selectors
 * within workflow scripts to improve replay reliability over time.
 */
export class SuccessRateTracker {
  private selectorStats = new Map<string, SelectorStats>();

  constructor(private store: WorkflowStore) {}

  recordRun(metrics: RunMetrics): void {
    this.store.updateSuccessRate(metrics.workflowId, metrics.succeeded);
    for (const step of metrics.steps) {
      this.recordStep(step);
    }
    const wf = this.store.get(metrics.workflowId);
    if (wf) {
      this.optimizeWorkflowSelectors(wf);
    }
  }

  private recordStep(step: StepMetrics): void {
    this.updateStats(step.selector, step.succeeded && !step.usedFallback, step.attempts);
    if (step.usedFallback && step.fallbackSelector) {
      this.updateStats(step.fallbackSelector, step.succeeded, step.attempts);
    }
  }

  private updateStats(selector: string, succeeded: boolean, attempts: number): void {
    const existing = this.selectorStats.get(selector) ?? {
      selector,
      attempts: 0,
      successes: 0,
      failures: 0,
    };
    existing.attempts += attempts;
    if (succeeded) existing.successes++;
    else existing.failures++;
    this.selectorStats.set(selector, existing);
  }

  /** Returns true when the selector has a failure rate > 30 % after 5+ attempts. */
  isFlaky(selector: string): boolean {
    const stats = this.selectorStats.get(selector);
    if (!stats || stats.attempts < 5) return false;
    return stats.failures / stats.attempts > 0.3;
  }

  getStats(selector: string): SelectorStats | undefined {
    return this.selectorStats.get(selector);
  }

  getAllStats(): SelectorStats[] {
    return [...this.selectorStats.values()];
  }

  private optimizeWorkflowSelectors(wf: WorkflowRecord): void {
    let changed = false;
    for (const step of wf.script.steps) {
      const primaryStats = this.selectorStats.get(step.selector.primary);
      if (primaryStats && primaryStats.failures > primaryStats.successes) {
        const bestFallback = step.selector.fallbacks.find((fb) => {
          const fbStats = this.selectorStats.get(fb);
          return !fbStats || fbStats.successes >= fbStats.failures;
        });
        if (bestFallback) {
          const idx = step.selector.fallbacks.indexOf(bestFallback);
          step.selector.fallbacks.splice(idx, 1);
          step.selector.fallbacks.unshift(step.selector.primary);
          step.selector.primary = bestFallback;
          changed = true;
        }
      }
    }
    if (changed) {
      wf.updatedAt = Date.now();
    }
  }
}
