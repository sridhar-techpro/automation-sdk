import { ActionResult } from '../core/types';

export class ActionLogger {
  private logs: ActionResult[] = [];

  log(result: ActionResult): void {
    this.logs.push(result);
    const status = result.success ? '✓' : '✗';
    const ts = new Date(result.timestamp).toISOString();
    console.log(
      `[${ts}] ${status} ${result.action.toUpperCase()} "${result.target}" ${result.duration}ms${result.error ? ` ERROR: ${result.error}` : ''}`
    );
  }

  getLogs(): ActionResult[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}
