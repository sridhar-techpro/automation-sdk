import { StepRecord } from '../recorder/types';
import { selectPrimaryAndFallbacks } from '../selectors/selector-ranker';
import { ReplayScript, ReplayStep } from './types';

const NAVIGATE_TIMEOUT = 30000;
const DEFAULT_ACTION_TIMEOUT = 10000;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Converts recorded steps into a replayable script with primary + fallback selectors,
 * wait configurations, and retry counts.
 */
export function generateReplayScript(goal: string, records: StepRecord[]): ReplayScript {
  const steps: ReplayStep[] = records.map((rec) => {
    const { primary, fallbacks } = selectPrimaryAndFallbacks(rec.selectors ?? []);

    const wait: ReplayStep['wait'] = {};
    if (rec.action === 'navigate') {
      wait.before = 'domcontentloaded';
      wait.timeout = NAVIGATE_TIMEOUT;
    } else if (rec.action === 'click') {
      wait.after = rec.domPath ?? undefined;
      wait.timeout = DEFAULT_ACTION_TIMEOUT;
    } else {
      wait.timeout = DEFAULT_ACTION_TIMEOUT;
    }

    return {
      action: rec.action,
      target: rec.target,
      value: rec.text,
      selector: { primary, fallbacks },
      wait,
      retry: 3,
    };
  });

  return { id: generateId(), goal, createdAt: Date.now(), steps };
}
