import { ActionResult, TraceStep } from '../core/types';

export class ActionLogger {
  private logs: ActionResult[] = [];
  private steps: TraceStep[] = [];

  log(result: ActionResult): void {
    this.logs.push(result);
    const status = result.success ? '✓' : '✗';
    const ts = new Date(result.timestamp).toISOString();
    console.log(
      `[${ts}] ${status} ${result.action.toUpperCase()} "${result.target}" ${result.duration}ms${result.error ? ` ERROR: ${result.error}` : ''}`
    );
  }

  /**
   * Records a fine-grained tracing step (selector resolution, retry attempts,
   * etc.) for diagnostic purposes.
   */
  logStep(step: TraceStep): void {
    this.steps.push(step);
    if (step.type === 'retry_attempt') {
      console.debug(`[trace] retry #${step.attempt ?? '?'} — ${step.message ?? ''}`);
    } else if (step.type === 'selector_resolved') {
      console.debug(`[trace] selector "${step.selector}" resolved as ${step.resolvedAs ?? 'unknown'}`);
    }
  }

  getLogs(): ActionResult[] {
    return [...this.logs];
  }

  getSteps(): TraceStep[] {
    return [...this.steps];
  }

  clear(): void {
    this.logs = [];
    this.steps = [];
  }
}
