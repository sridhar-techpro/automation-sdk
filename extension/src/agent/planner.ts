/**
 * Planner — calls backend /llm with the planner prompt + goal,
 * returns structured steps.
 *
 * The backend reads OPENAI_API_KEY from its environment only.
 * No keys are stored here.
 */

export interface PlanStep {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'wait';
  target: string;
  value?: string;
  url?: string;
  description?: string;
}

export interface Plan {
  steps: PlanStep[];
}

const BACKEND = 'http://127.0.0.1:8000';

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

  if (!resp.ok) {
    throw new Error(`Backend /llm returned HTTP ${resp.status}`);
  }

  const data = await resp.json() as { response: string };

  try {
    const parsed = JSON.parse(data.response) as Plan;
    return parsed;
  } catch {
    // Backend returned prose instead of JSON — wrap as a single description step
    return {
      steps: [{ action: 'navigate', target: goal, description: data.response }],
    };
  }
}
