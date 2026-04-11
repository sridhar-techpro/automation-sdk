/**
 * Content script for the Automation SDK Chrome Extension.
 *
 * Runs in the context of every web page.  Receives action commands from the
 * background service worker, executes them against the live DOM, and returns
 * structured results.  Errors are returned as structured results (not thrown)
 * so the background can log them centrally.
 */

import type {
  BackgroundToContent,
  ContentToBackground,
  ExtensionActionPayload,
  ExtensionActionResult,
} from './types';

// ─── Action executors ─────────────────────────────────────────────────────────

function executeClick(target: string): void {
  const el = document.querySelector<HTMLElement>(target);
  if (!el) throw new Error(`Element not found: ${target}`);
  el.click();
}

function executeType(target: string, value: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(target);
  if (!el) throw new Error(`Element not found: ${target}`);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function executeNavigate(url: string): void {
  window.location.href = url;
}

function executeScroll(): void {
  window.scrollBy(0, window.innerHeight);
}

async function executeAction(payload: ExtensionActionPayload): Promise<ExtensionActionResult> {
  const start = Date.now();
  try {
    switch (payload.action) {
      case 'click':
        executeClick(payload.target);
        break;
      case 'type':
        executeType(payload.target, payload.value ?? '');
        break;
      case 'navigate':
        executeNavigate(payload.target);
        break;
      case 'scroll':
        executeScroll();
        break;
      case 'screenshot':
        // Screenshots are handled at the browser level (background/DevTools);
        // content scripts cannot capture screenshots, so we acknowledge only.
        break;
      default: {
        const _exhaustive: never = payload.action;
        throw new Error(`Unknown action: ${String(_exhaustive)}`);
      }
    }
    return {
      success: true,
      action: payload.action,
      target: payload.target,
      timestamp: start,
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      action: payload.action,
      target: payload.target,
      timestamp: start,
      duration: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    msg: BackgroundToContent,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (resp: ContentToBackground) => void,
  ) => {
    if (msg.type !== 'EXECUTE_ACTION') return false;

    void executeAction(msg.payload).then((result) => {
      const resp: ContentToBackground = { type: 'ACTION_RESULT', result };
      sendResponse(resp);
    });

    return true; // keep channel open for async sendResponse
  },
);
