import { WorkflowRecord } from '../replay/types';

const CONFIDENCE_THRESHOLD = 0.75;
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'from', 'on', 'in', 'at', 'for', 'and', 'or', 'is', 'it', 'i',
]);

export class SemanticMatcher {
  readonly CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD;

  normalize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  }

  keywordScore(goal: string, candidate: string): number {
    const goalTokens = new Set(this.normalize(goal));
    const candTokens = new Set(this.normalize(candidate));
    if (goalTokens.size === 0 && candTokens.size === 0) return 0;
    const intersection = [...goalTokens].filter((t) => candTokens.has(t)).length;
    const union = new Set([...goalTokens, ...candTokens]).size;
    return union > 0 ? intersection / union : 0;
  }

  async semanticMatch(
    goal: string,
    candidates: Array<{ id: string; goal: string }>,
    backendUrl: string,
  ): Promise<{ workflowId: string; confidence: number } | null> {
    try {
      const res = await fetch(`${backendUrl}/match-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, candidates }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { workflowId: string | null; confidence: number };
      if (!data.workflowId) return null;
      return { workflowId: data.workflowId, confidence: data.confidence };
    } catch {
      return null;
    }
  }

  async findBestWorkflow(
    goal: string,
    workflows: WorkflowRecord[],
    backendUrl?: string,
  ): Promise<{ workflow: WorkflowRecord; confidence: number; method: 'exact' | 'keyword' | 'semantic' } | null> {
    let bestWorkflow: WorkflowRecord | null = null;
    let bestScore = 0;

    for (const wf of workflows) {
      const score = this.keywordScore(goal, wf.goal);
      if (score > bestScore) {
        bestScore = score;
        bestWorkflow = wf;
      }
    }

    if (bestScore >= CONFIDENCE_THRESHOLD && bestWorkflow) {
      return { workflow: bestWorkflow, confidence: bestScore, method: 'keyword' };
    }

    if (bestScore > 0.3 && backendUrl && bestWorkflow) {
      const candidates = workflows.map((wf) => ({ id: wf.id, goal: wf.goal }));
      const result = await this.semanticMatch(goal, candidates, backendUrl);
      if (result && result.confidence >= CONFIDENCE_THRESHOLD) {
        const matched = workflows.find((wf) => wf.id === result.workflowId);
        if (matched) {
          return { workflow: matched, confidence: result.confidence, method: 'semantic' };
        }
      }
    }

    return null;
  }
}
