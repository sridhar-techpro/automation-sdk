export interface ReplayStep {
  action: string;
  target?: string;
  value?: string;
  selector: {
    primary: string;
    fallbacks: string[];
  };
  wait: {
    before?: string;
    after?: string;
    timeout?: number;
  };
  retry: number;
}

export interface ReplayScript {
  id: string;
  goal: string;
  createdAt: number;
  steps: ReplayStep[];
}

export interface WorkflowRecord {
  id: string;
  goal: string;
  script: ReplayScript;
  metadata: Record<string, unknown>;
  version: number;
  successRate: number;
  totalRuns: number;
  successfulRuns: number;
  createdAt: number;
  updatedAt: number;
  needsRevalidation?: boolean;
}

export interface StepMetrics {
  stepIndex: number;
  selector: string;
  attempts: number;
  succeeded: boolean;
  usedFallback: boolean;
  fallbackSelector?: string;
  durationMs: number;
}

export interface RunMetrics {
  workflowId: string;
  runId: string;
  startedAt: number;
  finishedAt: number;
  succeeded: boolean;
  steps: StepMetrics[];
}
