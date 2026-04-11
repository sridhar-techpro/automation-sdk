/**
 * Shared message and log types for the Chrome Extension.
 * Used by background service worker, popup, and content script.
 */

// ─── Action types (mirrors SDK ActionPayload) ─────────────────────────────────

export type ExtensionAction = 'click' | 'type' | 'navigate' | 'screenshot';

export interface ExtensionActionPayload {
  action: ExtensionAction;
  target: string;
  value?: string;
}

export interface ExtensionActionResult {
  success: boolean;
  action: ExtensionAction;
  target: string;
  timestamp: number;
  duration: number;
  error?: string;
}

// ─── Background ↔ Popup messages ──────────────────────────────────────────────

export type PopupToBackground =
  | { type: 'EXECUTE_ACTION'; payload: ExtensionActionPayload; tabId: number }
  | { type: 'GET_STATUS' };

export type BackgroundToPopup =
  | { type: 'ACTION_RESULT'; result: ExtensionActionResult }
  | { type: 'STATUS'; connected: boolean; tabId: number | null };

// ─── Background ↔ Content Script messages ─────────────────────────────────────

export type BackgroundToContent =
  | { type: 'EXECUTE_ACTION'; payload: ExtensionActionPayload };

export type ContentToBackground =
  | { type: 'ACTION_RESULT'; result: ExtensionActionResult };

// ─── Backend logging types ────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  source: 'background' | 'content-script' | 'popup';
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
