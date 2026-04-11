// compiled from content-script.ts
// DO NOT EDIT — edit content-script.ts and rebuild

function executeClick(target) {
  const el = document.querySelector(target);
  if (!el) throw new Error(`Element not found: ${target}`);
  el.click();
}

function executeType(target, value) {
  const el = document.querySelector(target);
  if (!el) throw new Error(`Element not found: ${target}`);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function executeNavigate(url) {
  window.location.href = url;
}

async function executeAction(payload) {
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
      case 'screenshot':
        // acknowledged only at content-script level
        break;
      default:
        throw new Error(`Unknown action: ${String(payload.action)}`);
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'EXECUTE_ACTION') return false;

  void executeAction(msg.payload).then((result) => {
    sendResponse({ type: 'ACTION_RESULT', result });
  });

  return true;
});
