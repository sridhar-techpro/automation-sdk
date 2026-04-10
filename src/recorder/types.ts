export interface StepRecord {
  action: string;
  target: string;
  text?: string;
  role?: string;
  ariaLabel?: string;
  dataTestId?: string;
  domPath?: string;
  url?: string;
  timestamp: number;
  selectors?: SelectorCandidate[];
}

export type SelectorPriority = 'data-testid' | 'aria-label' | 'role-text' | 'text' | 'css' | 'xpath';

export interface SelectorCandidate {
  type: SelectorPriority;
  value: string;
  /** Lower number = higher priority */
  rank: number;
}
