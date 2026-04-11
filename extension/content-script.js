"use strict";
/**
 * Content script for the Automation SDK Chrome Extension.
 *
 * Runs in the context of every web page.  Receives action commands from the
 * background service worker, executes them against the live DOM, and returns
 * structured results.  Errors are returned as structured results (not thrown)
 * so the background can log them centrally.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// ─── Action executors ─────────────────────────────────────────────────────────
function executeClick(target) {
    const el = document.querySelector(target);
    if (!el)
        throw new Error(`Element not found: ${target}`);
    el.click();
}
function executeType(target, value) {
    const el = document.querySelector(target);
    if (!el)
        throw new Error(`Element not found: ${target}`);
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
                // Screenshots are handled at the browser level (background/DevTools);
                // content scripts cannot capture screenshots, so we acknowledge only.
                break;
            default: {
                const _exhaustive = payload.action;
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
    }
    catch (err) {
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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== 'EXECUTE_ACTION')
        return false;
    void executeAction(msg.payload).then((result) => {
        const resp = { type: 'ACTION_RESULT', result };
        sendResponse(resp);
    });
    return true; // keep channel open for async sendResponse
});
