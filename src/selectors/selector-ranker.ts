import { SelectorCandidate } from '../recorder/types';

const PRIORITY: Record<string, number> = {
  'data-testid': 1,
  'aria-label': 2,
  'role-text': 3,
  text: 4,
  css: 5,
  xpath: 6,
};

/**
 * Ranks selector candidates by priority, then by length within the same band.
 */
export function rankSelectors(candidates: SelectorCandidate[]): SelectorCandidate[] {
  return [...candidates].sort((a, b) => {
    const pa = PRIORITY[a.type] ?? 99;
    const pb = PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.value.length - b.value.length;
  });
}

/**
 * Returns true if the selector is likely brittle (nth-child, index-based, hash classes).
 */
export function isBrittleSelector(selector: string): boolean {
  return (
    /nth-child|nth-of-type|\[\d+\]/.test(selector) ||
    /\.[a-z0-9]{8,}/i.test(selector)
  );
}

/**
 * Builds a composite role+text selector.
 */
export function buildCompositeSelector(role: string, text: string): SelectorCandidate {
  const safeRole = role.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return {
    type: 'role-text',
    value: `::-p-xpath(//*[@role="${safeRole}" and normalize-space(.)="${safeText}"])`,
    rank: PRIORITY['role-text'],
  };
}

/**
 * Returns the best primary selector and an ordered fallback list.
 * Brittle selectors are demoted; if all are brittle they are used as fallbacks.
 */
export function selectPrimaryAndFallbacks(candidates: SelectorCandidate[]): {
  primary: string;
  fallbacks: string[];
} {
  const stable = rankSelectors(candidates.filter((c) => !isBrittleSelector(c.value)));
  const ranked = stable.length > 0 ? stable : rankSelectors(candidates);
  return {
    primary: ranked[0]?.value ?? '',
    fallbacks: ranked.slice(1).map((c) => c.value),
  };
}
