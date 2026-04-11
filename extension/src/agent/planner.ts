/**
 * Planner — calls backend /llm with the planner prompt + goal,
 * returns a per-site execution plan.
 *
 * The backend reads OPENAI_API_KEY from its environment only.
 * No keys are stored here.
 */

export interface PlanStep {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'wait' | 'scroll';
  target: string;
  value?: string;
  url?: string;
  description?: string;
}

export interface SitePlan {
  site: string;
  steps: PlanStep[];
}

/** The canonical plan the planner returns. */
export interface Plan {
  sites: SitePlan[];
}

const BACKEND = 'http://127.0.0.1:8000';

function stripFences(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  return fence ? fence[1].trim() : raw.trim();
}

export async function planGoal(
  goal: string,
  promptTemplate: string,
): Promise<Plan> {
  const prompt = `${promptTemplate}\n\nUser goal: ${goal}`;

  const resp = await fetch(`${BACKEND}/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) throw new Error(`Backend /llm returned HTTP ${resp.status}`);

  const data = await resp.json() as { response: string };
  const jsonStr = stripFences(data.response);

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // New format: { sites: [{site, steps}] }
    if (Array.isArray(parsed['sites'])) {
      return parsed as unknown as Plan;
    }

    // Legacy format: { steps: [...] } — wrap in a single anonymous site
    if (Array.isArray(parsed['steps'])) {
      return { sites: [{ site: 'default', steps: parsed['steps'] as PlanStep[] }] };
    }

    // Unknown shape — treat as empty plan so orchestrator falls back
    return { sites: [] };
  } catch {
    // Non-JSON response — empty plan triggers orchestrator fallback
    return { sites: [] };
  }
}
