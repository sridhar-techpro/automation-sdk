/**
 * Side-panel Goal Runner
 *
 * Accepts a natural-language goal, sends it to the backend /llm endpoint,
 * and displays the AI-generated response in the panel.
 *
 * The backend reads OPENAI_API_KEY from its environment — the key is never
 * stored in extension code.
 */

const BACKEND_LLM_URL = 'http://127.0.0.1:8000/llm';

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

btnSend.addEventListener('click', async () => {
  const goal = goalInput.value.trim();
  if (!goal) {
    setStatus('Please enter a goal.');
    return;
  }

  btnSend.disabled = true;
  setStatus('Running…');
  resultEl.classList.remove('visible');

  try {
    const prompt =
      `You are a helpful shopping assistant. When asked to compare or recommend products, ` +
      `provide a numbered list. Be concise and factual.\n\nUser goal: ${goal}`;

    const resp = await fetch(BACKEND_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!resp.ok) {
      throw new Error(`Backend returned HTTP ${resp.status}`);
    }

    const data = await resp.json() as { response: string };
    showResult(data.response);
    setStatus('Done.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showResult(`Error: ${msg}`);
    setStatus('Failed.');
  } finally {
    btnSend.disabled = false;
  }
});
