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

const actionSelect = document.getElementById('action') as HTMLSelectElement;
const targetInput  = document.getElementById('target')  as HTMLInputElement;
const valueInput   = document.getElementById('value')   as HTMLInputElement;
const valueField   = document.getElementById('value-field') as HTMLDivElement;
const btnRun       = document.getElementById('btn-run')   as HTMLButtonElement;
const btnClear     = document.getElementById('btn-clear') as HTMLButtonElement;
const statusEl     = document.getElementById('status')    as HTMLDivElement;

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

// ─── Action-select: show/hide value field ─────────────────────────────────────

actionSelect.addEventListener('change', () => {
  valueField.style.display = actionSelect.value === 'type' ? 'block' : 'none';
});
// Initial state
valueField.style.display = 'none';

// ─── Clear button ─────────────────────────────────────────────────────────────

btnClear.addEventListener('click', () => {
  targetInput.value = '';
  valueInput.value  = '';
  actionSelect.value = 'navigate';
  valueField.style.display = 'none';
  clearStatus();
});

// ─── Run button ───────────────────────────────────────────────────────────────

btnRun.addEventListener('click', () => {
  const action = actionSelect.value as ExtensionAction;
  const target = targetInput.value.trim();

  if (!target) {
    showStatus('Target / URL is required.', 'error');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
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
