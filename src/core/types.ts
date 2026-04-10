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

export type SelectorType = 'css' | 'text-exact' | 'text-partial';

export interface ParsedSelector {
  type: SelectorType;
  value: string;
}
