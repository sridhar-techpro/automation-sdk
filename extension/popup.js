// compiled from popup.ts
// DO NOT EDIT — edit popup.ts and rebuild

const actionSelect = document.getElementById('action');
const targetInput  = document.getElementById('target');
const valueInput   = document.getElementById('value');
const valueField   = document.getElementById('value-field');
const btnRun       = document.getElementById('btn-run');
const btnClear     = document.getElementById('btn-clear');
const statusEl     = document.getElementById('status');

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind;
}

function clearStatus() {
  statusEl.textContent = '';
  statusEl.className = '';
  statusEl.style.display = 'none';
}

function setLoading(loading) {
  btnRun.disabled = loading;
  btnClear.disabled = loading;
  btnRun.textContent = loading ? 'Running\u2026' : 'Run';
}

// Show/hide value field based on action
actionSelect.addEventListener('change', () => {
  valueField.style.display = actionSelect.value === 'type' ? 'block' : 'none';
});
valueField.style.display = 'none';

// Clear button
btnClear.addEventListener('click', () => {
  targetInput.value  = '';
  valueInput.value   = '';
  actionSelect.value = 'navigate';
  valueField.style.display = 'none';
  clearStatus();
});

// Run button
btnRun.addEventListener('click', () => {
  const action = actionSelect.value;
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

    const msg = {
      type: 'EXECUTE_ACTION',
      payload: {
        action,
        target,
        value: valueInput.value || undefined,
      },
      tabId,
    };

    chrome.runtime.sendMessage(msg, (response) => {
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
        showStatus(`Done in ${response.result.duration}ms`, 'success');
      } else {
        showStatus('Action failed. Check the backend logs.', 'error');
      }
    });
  });
});
