/**
 * Side-panel Goal Runner
 *
 * Accepts a natural-language goal, sends it to the background service worker
 * as a PLAN_GOAL message, which runs the full agent pipeline:
 *   Planner → Executor → Extractor → Reasoner
 *
 * No prompts or LLM calls happen here — everything is delegated to the
 * background orchestrator which loads prompts from extension/prompts/*.md.
 */

const goalInput = document.getElementById('goal-input') as HTMLTextAreaElement;
const btnSend   = document.getElementById('btn-send')   as HTMLButtonElement;
const statusEl  = document.getElementById('status')     as HTMLDivElement;
const resultEl  = document.getElementById('result')     as HTMLDivElement;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function showResult(text: string): void {
  resultEl.textContent = text;
  resultEl.classList.add('visible');
}

function formatResult(resp: {
  success: boolean;
  stepsExecuted: number;
  summary?: string;
  reasoning?: string;
  topProducts?: unknown[];
  error?: string;
}): string {
  if (!resp.success && resp.error) return `Error: ${resp.error}`;

  const parts: string[] = [];
  if (resp.summary) parts.push(resp.summary);
  if (resp.reasoning) parts.push(`\nReasoning:\n${resp.reasoning}`);
  if (resp.topProducts && resp.topProducts.length > 0) {
    parts.push(`\nTop results:\n${JSON.stringify(resp.topProducts, null, 2)}`);
  }
  if (parts.length === 0) parts.push(`Completed ${resp.stepsExecuted} step(s).`);
  return parts.join('\n');
}

btnSend.addEventListener('click', async () => {
  const goal = goalInput.value.trim();
  if (!goal) {
    setStatus('Please enter a goal.');
    return;
  }

  btnSend.disabled = true;
  setStatus('Running pipeline…');
  resultEl.classList.remove('visible');

  try {
    // Get the active tab so the orchestrator can interact with it
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id;
    if (!tabId) throw new Error('No active tab found.');

    // Send to background — background runs: Planner → Executor → Extractor → Reasoner
    const result = await new Promise<{
      success: boolean;
      stepsExecuted: number;
      summary?: string;
      reasoning?: string;
      topProducts?: unknown[];
      error?: string;
    }>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'PLAN_GOAL', goal, tabId },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        },
      );
    });

    showResult(formatResult(result));
    setStatus(result.success ? 'Done.' : 'Completed with errors.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showResult(`Error: ${msg}`);
    setStatus('Failed.');
  } finally {
    btnSend.disabled = false;
  }
});
