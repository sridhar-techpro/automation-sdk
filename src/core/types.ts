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

// ─── Reliability Engine types ─────────────────────────────────────────────────

export type LoadState = 'domcontentloaded' | 'networkidle';

export interface ScrollDiscoveryOptions {
  /** Total search budget in milliseconds. Default: 30 000. */
  timeout?: number;
  /** Pixels to scroll per step. Default: 300. */
  scrollStep?: number;
  /** Maximum number of scroll steps before giving up. Default: 20. */
  maxScrolls?: number;
  /** Milliseconds to wait after each scroll step. Default: 200. */
  waitAfterScroll?: number;
}

export interface ProgressiveDiscoveryOptions {
  /** Total budget for the entire discovery run. Default: 30 000 ms. */
  timeout?: number;
  /** Partial text to try when the exact selector fails. */
  partialText?: string;
  /** ARIA role to try when both selector and text-based fallbacks fail. */
  role?: string;
  /**
   * Whether to attempt scroll-based discovery as the last resort.
   * Default: true.
   */
  scrollDiscovery?: boolean;
}

export interface WaitForElementAfterActionOptions {
  /** Maximum ms to wait for the target element. Default: 30 000. */
  timeout?: number;
}
