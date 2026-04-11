// compiled from background.ts
// DO NOT EDIT — edit background.ts and rebuild

const BACKEND_LOG_URL = 'http://127.0.0.1:8000/logs';
const LOG_MAX_RETRIES = 3;
const LOG_RETRY_BASE_MS = 200;

async function sendLogWithRetry(level, message, data) {
  const entry = {
    level,
    source: 'background',
    message,
    timestamp: Date.now(),
    data: data ?? {},
  };
  const body = JSON.stringify(entry);

  for (let attempt = 0; attempt < LOG_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(BACKEND_LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return;
    } catch {
      // network error — retry
    }
    if (attempt < LOG_MAX_RETRIES - 1) {
      await new Promise((r) =>
        setTimeout(r, LOG_RETRY_BASE_MS * Math.pow(2, attempt)),
      );
    }
  }
  // All retries exhausted — drop silently to avoid crashing the service worker.
}

const sendLog = sendLogWithRetry;

function sendToContentScript(tabId, msg) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Content script response timeout'));
    }, 30_000);

    chrome.tabs.sendMessage(tabId, msg, (response) => {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id ?? null;
      sendResponse({ type: 'STATUS', connected: tabId !== null, tabId });
    });
    return true;
  }

  if (msg.type === 'EXECUTE_ACTION') {
    const { payload, tabId } = msg;

    void sendLog('info', 'Executing action', {
      action: payload.action,
      target: payload.target,
      tabId,
    });

    const contentMsg = { type: 'EXECUTE_ACTION', payload };

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
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        void sendLog('error', 'Action failed', { error: errMsg });
        const result = {
          success: false,
          action: payload.action,
          target: payload.target,
          timestamp: Date.now(),
          duration: 0,
          error: errMsg,
        };
        sendResponse({ type: 'ACTION_RESULT', result });
      });

    return true;
  }

  return false;
});

void sendLog('info', 'Background service worker started');
