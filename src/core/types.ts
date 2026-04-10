export type ActionType = 'click' | 'type' | 'navigate' | 'screenshot';

export interface ActionPayload {
  action: ActionType;
  target: string;
  value?: string;
}

export interface ActionResult {
  success: boolean;
  action: ActionType;
  target: string;
  timestamp: number;
  error?: string;
  duration: number;
}

export interface SDKConfig {
  browserWSEndpoint?: string;
  defaultTimeout: number;
  retries: number;
  retryDelay: number;
  connectTimeout?: number;
  allowedDomains?: string[];
}

export interface RetryOptions {
  retries: number;
  delay: number;
  backoff: number;
}

export interface WaitOptions {
  timeout: number;
  visible?: boolean;
}

export type SelectorType = 'css' | 'text-exact' | 'text-partial' | 'xpath' | 'shadow';

export interface ParsedSelector {
  type: SelectorType;
  value: string;
}

export interface LocatorState {
  nth?: number;   // -1 means last
  hasText?: string;
}

export interface ActionabilityOptions {
  checkStability?: boolean;
  checkCoverage?: boolean;
}

export interface TraceStep {
  type: 'selector_resolved' | 'action_start' | 'action_end' | 'retry_attempt';
  selector?: string;
  resolvedAs?: string;
  attempt?: number;
  message?: string;
  timestamp: number;
}
