import * as fs from 'fs';
import * as path from 'path';
import { WorkflowRecord, ReplayScript } from '../replay/types';

function generateId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * In-memory workflow store with optional file persistence.
 */
export class WorkflowStore {
  private workflows = new Map<string, WorkflowRecord>();
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
    if (persistPath) this.loadFromDisk();
  }

  save(
    goal: string,
    script: ReplayScript,
    metadata: Record<string, unknown> = {},
  ): WorkflowRecord {
    const existing = [...this.workflows.values()].find((w) => w.goal === goal);
    if (existing) {
      existing.script = script;
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.version++;
      existing.updatedAt = Date.now();
      this.persist();
      return existing;
    }

    const record: WorkflowRecord = {
      id: generateId(),
      goal,
      script,
      metadata,
      version: 1,
      successRate: 0,
      totalRuns: 0,
      successfulRuns: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.workflows.set(record.id, record);
    this.persist();
    return record;
  }

  get(id: string): WorkflowRecord | undefined {
    return this.workflows.get(id);
  }

  findByGoal(goal: string): WorkflowRecord | undefined {
    for (const wf of this.workflows.values()) {
      if (wf.goal === goal) return wf;
    }
    return undefined;
  }

  findByKeyword(goal: string): WorkflowRecord | undefined {
    const goalTokens = new Set(goal.toLowerCase().split(/\W+/).filter(Boolean));
    let best: WorkflowRecord | undefined;
    let bestScore = 0;
    for (const wf of this.workflows.values()) {
      const wfTokens = new Set(wf.goal.toLowerCase().split(/\W+/).filter(Boolean));
      const intersection = [...goalTokens].filter((t) => wfTokens.has(t)).length;
      const union = new Set([...goalTokens, ...wfTokens]).size;
      const score = union > 0 ? intersection / union : 0;
      if (score > bestScore) {
        bestScore = score;
        best = wf;
      }
    }
    return bestScore >= 0.5 ? best : undefined;
  }

  list(): WorkflowRecord[] {
    return [...this.workflows.values()];
  }

  updateSuccessRate(id: string, succeeded: boolean): void {
    const wf = this.workflows.get(id);
    if (!wf) return;
    wf.totalRuns++;
    if (succeeded) wf.successfulRuns++;
    wf.successRate = wf.totalRuns > 0 ? wf.successfulRuns / wf.totalRuns : 0;
    wf.updatedAt = Date.now();
    if (wf.totalRuns >= 3 && wf.successRate < 0.5) {
      wf.needsRevalidation = true;
    }
    this.persist();
  }

  delete(id: string): boolean {
    const deleted = this.workflows.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });
      const lines = [...this.workflows.values()].map((w) => JSON.stringify(w));
      fs.writeFileSync(this.persistPath, lines.join('\n') + '\n', 'utf8');
    } catch {
      /* ignore write errors */
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      if (!fs.existsSync(this.persistPath)) return;
      const content = fs.readFileSync(this.persistPath, 'utf8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const wf = JSON.parse(line) as WorkflowRecord;
          this.workflows.set(wf.id, wf);
        } catch {
          /* skip corrupt lines */
        }
      }
    } catch {
      /* ignore read errors */
    }
  }
}
