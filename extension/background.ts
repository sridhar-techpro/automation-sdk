/**
 * Background service worker for the Automation SDK Chrome Extension.
 *
 * Responsibilities:
 *  - Receives action commands from the popup
 *  - Forwards commands to the active tab's content script
 *  - Logs all events to the backend logging API
 *  - Returns results back to the popup
 */

import type {
  PopupToBackground,
  BackgroundToPopup,
  BackgroundToContent,
  ContentToBackground,
  ExtensionAction,
  ExtensionActionPayload,
  ExtensionActionResult,
  LogEntry,
  LogLevel,
} from './types';
import { orchestrate } from './src/agent/orchestrator';

// ─── Configuration ────────────────────────────────────────────────────────────

const BACKEND_BASE_URL   = 'http://127.0.0.1:8000';

// ─── Extension icon click → open index.html in a new tab ─────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('side-panel/index.html') });
});
const BACKEND_LOG_URL = `${BACKEND_BASE_URL}/logs`;
const LOG_MAX_RETRIES = 3;
const LOG_RETRY_BASE_MS = 200; // exponential backoff: 200 → 400 → 800 ms

// ─── Logging helpers ──────────────────────────────────────────────────────────

/**
 * Attempts to POST a structured log entry to the backend log server.
 * Retries up to LOG_MAX_RETRIES times with exponential backoff.
 * Errors are never surfaced to callers.
 */
async function sendLogWithRetry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const entry: LogEntry = {
    level,
    source: 'background',
    message,
    timestamp: Date.now(),
    data,
  };
  const body = JSON.stringify(entry);

  for (let attempt = 0; attempt < LOG_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(BACKEND_LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return; // success
    } catch {
      // network error — fall through to retry
    }
    if (attempt < LOG_MAX_RETRIES - 1) {
      await new Promise<void>((r) =>
        setTimeout(r, LOG_RETRY_BASE_MS * Math.pow(2, attempt)),
      );
    }
  }
  // All retries exhausted — log silently dropped to avoid crashing the worker.
}

/** Convenience alias — top-level code still uses the short name. */
const sendLog = sendLogWithRetry;

// ─── Content-script bridge ────────────────────────────────────────────────────

/**
 * Sends a command to the content script in the specified tab and waits for
 * the result.  Times out after 30 seconds to avoid hanging the service worker.
 */
function sendToContentScript(
  tabId: number,
  msg: BackgroundToContent,
): Promise<ExtensionActionResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Content script response timeout'));
    }, 30_000);

    chrome.tabs.sendMessage(tabId, msg, (response: ContentToBackground | undefined) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || response.type !== 'ACTION_RESULT') {
        reject(new Error('Unexpected response from content script'));
        return;
      }
      resolve(response.result);
    });
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    msg: PopupToBackground,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (resp: BackgroundToPopup) => void,
  ) => {
    if (msg.type === 'PLAN_GOAL') {
      const { goal, tabId } = msg;

      void (async () => {
        try {
          const result = await orchestrate(goal, tabId);
          sendResponse({
            type: 'GOAL_RESULT',
            success: result.success,
            stepsExecuted: result.stepsExecuted,
            stepResults: [],
            summary: result.summary,
            topProducts: result.topProducts,
            reasoning: result.reasoning,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sendLog('error', 'Orchestration failed', { error: errMsg });
          sendResponse({ type: 'GOAL_RESULT', success: false, stepsExecuted: 0,
            stepResults: [], error: errMsg });
        }
      })();

      return true; // keep message channel open for async sendResponse
    }

    if (msg.type === 'GET_STATUS') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id ?? null;
        sendResponse({ type: 'STATUS', connected: tabId !== null, tabId });
      });
      return true; // keep channel open for async sendResponse
    }

    if (msg.type === 'EXECUTE_ACTION') {
      const { payload, tabId } = msg;

      void sendLog('info', 'Executing action', {
        action: payload.action,
        target: payload.target,
        tabId,
      });

      const contentMsg: BackgroundToContent = { type: 'EXECUTE_ACTION', payload };

      sendToContentScript(tabId, contentMsg)
        .then((result) => {
          void sendLog(result.success ? 'info' : 'error', 'Action result', {
            action: result.action,
            target: result.target,
            success: result.success,
            duration: result.duration,
            error: result.error,
          });
          sendResponse({ type: 'ACTION_RESULT', result });
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          void sendLog('error', 'Action failed', { error: errMsg });
          const result: ExtensionActionResult = {
            success: false,
            action: payload.action,
            target: payload.target,
            timestamp: Date.now(),
            duration: 0,
            error: errMsg,
          };
          sendResponse({ type: 'ACTION_RESULT', result });
        });

      return true; // keep channel open for async sendResponse
    }

    return false;
  },
);

void sendLog('info', 'Background service worker started');
