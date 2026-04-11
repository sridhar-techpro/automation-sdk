/**
 * Popup script for the Automation SDK Chrome Extension.
 *
 * Sends action commands to the background service worker and reflects the
 * result status in the UI.  All logging is handled by the background worker;
 * the popup UI stays clean (no raw logs or stack traces displayed to users).
 */

import type {
  PopupToBackground,
  BackgroundToPopup,
  ExtensionAction,
} from './types';

// ─── DOM references ───────────────────────────────────────────────────────────

const goalInput    = document.getElementById('goal-input')  as HTMLTextAreaElement;
const btnSend      = document.getElementById('btn-send')    as HTMLButtonElement;
const goalStatusEl = document.getElementById('goal-status') as HTMLDivElement;
const actionSelect = document.getElementById('action')      as HTMLSelectElement;
const targetInput  = document.getElementById('target')      as HTMLInputElement;
const valueInput   = document.getElementById('value')       as HTMLInputElement;
const valueField   = document.getElementById('value-field') as HTMLDivElement;
const btnRun       = document.getElementById('btn-run')     as HTMLButtonElement;
const btnClear     = document.getElementById('btn-clear')   as HTMLButtonElement;
const statusEl     = document.getElementById('status')      as HTMLDivElement;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showStatus(message: string, kind: 'success' | 'error' | 'info'): void {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function clearStatus(): void {
  statusEl.textContent = '';
  statusEl.className = '';
  statusEl.style.display = 'none';
}

function setLoading(loading: boolean): void {
  btnRun.disabled = loading;
  btnClear.disabled = loading;
  btnRun.textContent = loading ? 'Running…' : 'Run';
}

function showGoalStatus(message: string, kind: 'success' | 'error' | 'info'): void {
  goalStatusEl.textContent = message;
  goalStatusEl.className = kind;
}

function setGoalLoading(loading: boolean): void {
  btnSend.disabled = loading;
  btnSend.textContent = loading ? 'Running…' : 'Send';
}

// ─── Action-select: show/hide value field ─────────────────────────────────────

actionSelect.addEventListener('change', () => {
  valueField.style.display = actionSelect.value === 'type' ? 'block' : 'none';
});
// Initial state
valueField.style.display = 'none';

// ─── Clear button ─────────────────────────────────────────────────────────────

btnClear.addEventListener('click', () => {
  goalInput.value   = '';
  targetInput.value = '';
  valueInput.value  = '';
  actionSelect.value = 'navigate';
  valueField.style.display = 'none';
  clearStatus();
  goalStatusEl.textContent = '';
  goalStatusEl.className   = '';
});

// ─── Send button (goal → background → backend plan → execute steps) ───────────

btnSend.addEventListener('click', () => {
  const goal = goalInput.value.trim();
  if (!goal) {
    showGoalStatus('Please enter a goal.', 'error');
    return;
  }

  resolveTargetTab((tabId) => {
    if (tabId === undefined) {
      showGoalStatus('No active tab found. Open a page first.', 'error');
      return;
    }

    setGoalLoading(true);
    goalStatusEl.textContent = '';
    goalStatusEl.className   = '';

    const msg: PopupToBackground = { type: 'PLAN_GOAL', goal, tabId };

    chrome.runtime.sendMessage(msg, (response: BackgroundToPopup | undefined) => {
      setGoalLoading(false);

      if (chrome.runtime.lastError) {
        showGoalStatus('Extension error — please reload.', 'error');
        return;
      }

      if (!response || response.type !== 'GOAL_RESULT') {
        showGoalStatus('Unexpected response from background.', 'error');
        return;
      }

      if (response.success) {
        showGoalStatus(
          `Done — ${response.stepsExecuted} step${response.stepsExecuted !== 1 ? 's' : ''} executed.`,
          'success',
        );
      } else {
        showGoalStatus(
          response.error
            ? `Failed: ${response.error}`
            : 'Execution failed — check backend logs.',
          'error',
        );
      }
    });
  });
});

// ─── Run button ───────────────────────────────────────────────────────────────

// ─── resolveTargetTab ─────────────────────────────────────────────────────────

/**
 * Resolves the Chrome tab ID to target for the current action.
 *
 * Default behaviour (production): queries the active tab in the current window,
 * which is the tab the user has open when they click Run in the extension popup.
 *
 * Test-harness override: if the popup URL contains a `?targetUrl=<encoded-url>`
 * query parameter, scans ALL open tabs and returns the first tab whose URL
 * matches the provided value (exact match, then prefix fallback).  This allows
 * integration tests to target a specific controlled tab using the real
 * chrome.tabs API — no mocking required.
 *
 * The `targetUrl` param has ZERO effect in normal popup usage because the popup
 * URL is always opened by the browser action without any query string.
 */
function resolveTargetTab(callback: (id: number | undefined) => void): void {
  const params   = new URLSearchParams(window.location.search);
  const targetUrl = params.get('targetUrl') ?? '';

  if (targetUrl) {
    // Test override: find tab by URL (uses real chrome.tabs API, no mock needed)
    chrome.tabs.query({}, (allTabs) => {
      const tab = allTabs.find(
        (t) => t.url === targetUrl || (t.url ?? '').startsWith(targetUrl),
      );
      callback(tab?.id);
    });
  } else {
    // Normal operation: use the active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      callback(tabs[0]?.id);
    });
  }
}

btnRun.addEventListener('click', () => {
  const action = actionSelect.value as ExtensionAction;
  const target = targetInput.value.trim();

  if (!target) {
    showStatus('Target / URL is required.', 'error');
    return;
  }

  resolveTargetTab((tabId) => {
    if (tabId === undefined) {
      showStatus('No active tab found.', 'error');
      return;
    }

    setLoading(true);
    clearStatus();

    const msg: PopupToBackground = {
      type: 'EXECUTE_ACTION',
      payload: {
        action,
        target,
        value: valueInput.value || undefined,
      },
      tabId,
    };

    chrome.runtime.sendMessage(msg, (response: BackgroundToPopup | undefined) => {
      setLoading(false);

      if (chrome.runtime.lastError) {
        showStatus('Extension error. Please reload.', 'error');
        return;
      }

      if (!response || response.type !== 'ACTION_RESULT') {
        showStatus('Unexpected response.', 'error');
        return;
      }

      if (response.result.success) {
        showStatus(
          `Done in ${response.result.duration}ms`,
          'success',
        );
      } else {
        showStatus('Action failed. Check the backend logs.', 'error');
      }
    });
  });
});
