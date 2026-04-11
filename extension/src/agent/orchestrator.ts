/**
 * Orchestrator — main agent loop.
 *
 * Flow: parse intent → plan → navigate → execute → extract → reason → return result
 *
 * The orchestrator only coordinates; the backend handles LLM calls (/llm),
 * and the SDK (via content-script) handles all browser actions.
 */

import { parseIntent } from './intent-parser';
import { planGoal } from './planner';
import { resolveTargets } from './navigator';
import { executeStep } from './executor';
import { extractProducts } from './extractor';
import { reasonAboutProducts } from './reasoner';

const BACKEND = 'http://127.0.0.1:8000';

async function sendLog(
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${BACKEND}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'info',
        source: 'background',
        message,
        timestamp: Date.now(),
        data,
      }),
    });
  } catch { /* non-fatal */ }
}

async function loadPrompt(name: string): Promise<string> {
  const url = chrome.runtime.getURL(`prompts/${name}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Cannot load prompt ${name}`);
  return resp.text();
}

export interface OrchestrationResult {
  success: boolean;
  summary: string;
  topProducts?: unknown[];
  reasoning?: string;
  stepsExecuted: number;
}

export async function orchestrate(
  goal: string,
  tabId: number,
): Promise<OrchestrationResult> {
  await sendLog('orchestration start', { goal });

  // 1. Parse intent
  const intent = parseIntent(goal);
  await sendLog('intent parsed', { intent: intent.intent, sites: intent.sites });

  // 2. Load prompts
  let plannerPrompt = '';
  let extractorPrompt = '';
  let reasonerPrompt = '';
  try {
    [plannerPrompt, extractorPrompt, reasonerPrompt] = await Promise.all([
      loadPrompt('prompt-planner.md'),
      loadPrompt('prompt-extractor.md'),
      loadPrompt('prompt-reasoner.md'),
    ]);
  } catch (e) {
    await sendLog('prompt load error', { error: String(e) });
  }

  // 3. Plan
  let plan = { steps: [] as Awaited<ReturnType<typeof planGoal>>['steps'] };
  try {
    plan = await planGoal(goal, plannerPrompt);
    await sendLog('plan received', { stepsCount: plan.steps.length });
  } catch (e) {
    await sendLog('plan error', { error: String(e) });
    // Fall back to basic navigation
    const targets = resolveTargets(intent.sites, goal);
    plan.steps = targets.map((t) => ({
      action: 'navigate' as const,
      target: t.url,
      description: `Navigate to ${t.site}`,
    }));
  }

  // 4. Execute steps
  let stepsExecuted = 0;
  for (const step of plan.steps) {
    await sendLog('action start', { action: step.action, target: step.target });
    try {
      const result = await executeStep(step, tabId);
      stepsExecuted++;
      await sendLog(result.success ? 'action success' : 'action failure', {
        action: step.action,
        target: step.target,
        success: result.success,
        duration: result.duration,
        error: result.error,
      });
    } catch (e) {
      await sendLog('action failure', { action: step.action, error: String(e) });
    }
  }

  // 5. Extract products (if page HTML available)
  let products: Awaited<ReturnType<typeof extractProducts>> = [];
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body.innerHTML,
    });
    const pageHtml = (injected[0]?.result as string) ?? '';
    products = await extractProducts(pageHtml, extractorPrompt);
    await sendLog('extraction complete', { count: products.length });
  } catch (e) {
    await sendLog('extraction error', { error: String(e) });
  }

  // 6. Reason about results
  let reasoning = '';
  let topProducts: unknown[] = [];
  try {
    const result = await reasonAboutProducts(products, intent.filters, reasonerPrompt);
    topProducts = result.topProducts;
    reasoning = result.reasoning;
    await sendLog('reasoning complete', { topCount: topProducts.length });
  } catch (e) {
    await sendLog('reasoning error', { error: String(e) });
  }

  const summary = topProducts.length > 0
    ? `Top ${topProducts.length} results found.`
    : `Executed ${stepsExecuted} steps for goal: ${goal}`;

  await sendLog('orchestration complete', { stepsExecuted, topCount: topProducts.length });

  return {
    success: stepsExecuted > 0 || topProducts.length > 0,
    summary,
    topProducts,
    reasoning,
    stepsExecuted,
  };
}
