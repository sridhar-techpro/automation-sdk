/**
 * Orchestrator â€” main agent loop.
 *
 * Flow: parse intent â†’ plan (per-site) â†’ execute each site in a dedicated tab
 *       â†’ collect page text â†’ extract â†’ reason â†’ return result
 *
 * Generic by design: no site-specific logic lives here.
 * The LLM (via planner/extractor/reasoner) handles all domain reasoning.
 */

import { parseIntent } from './intent-parser';
import { planGoal, type SitePlan } from './planner';
import { resolveTargets } from './navigator';
import { executeStep } from './executor';
import { extractProducts } from './extractor';
import { reasonAboutProducts } from './reasoner';

const BACKEND = 'http://127.0.0.1:8000';

async function sendLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${BACKEND}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, source: 'background', message, timestamp: Date.now(), data }),
    });
  } catch { /* non-fatal */ }
}

async function loadPrompt(name: string): Promise<string> {
  const url = chrome.runtime.getURL(`prompts/${name}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Cannot load prompt ${name}`);
  return resp.text();
}

/**
 * Navigate a tab to a URL and wait for it to fully load.
 */
function navigateTabAndWait(tabId: number, url: string, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error(`Navigation timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    function onUpdated(id: number, info: chrome.tabs.TabChangeInfo): void {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.update(tabId, { url }, () => {
      if (chrome.runtime.lastError) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timer);
        reject(new Error(chrome.runtime.lastError.message ?? 'tabs.update failed'));
      }
    });
  });
}

/**
 * Wait for a CSS selector to appear in a tab, up to timeoutMs.
 */
async function waitForSelector(tabId: number, selector: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [frame] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => !!document.querySelector(sel),
        args: [selector],
      });
      if (frame?.result === true) return;
    } catch { /* page still loading */ }
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  throw new Error(`Selector "${selector}" not found within ${timeoutMs}ms`);
}

/**
 * Capture visible text from a tab â€” prefer innerText (reads like a human)
 * over innerHTML (full markup the LLM would have to parse).
 * Limits to 12 KB per page to stay within LLM context.
 */
async function capturePageText(tabId: number, cssSelector?: string): Promise<string> {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string | null) => {
      const root = sel ? document.querySelector(sel) : document.body;
      return (root as HTMLElement | null)?.innerText ?? '';
    },
    args: [cssSelector ?? null],
  });
  const text = (frame?.result as string) ?? '';
  return text.slice(0, 12_000);
}

/**
 * Execute one site's plan in a dedicated tab.
 * Returns collected page text from that site.
 */
async function runSiteInTab(
  site: string,
  steps: SitePlan['steps'],
): Promise<{ stepsExecuted: number; pageText: string }> {
  let tabId: number | null = null;
  let stepsExecuted = 0;
  let pageText = '';

  try {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    tabId = tab.id ?? null;
    if (!tabId) throw new Error('Could not create tab for site: ' + site);

    await sendLog('info', `[${site}] tab opened`, { tabId });

    for (const step of steps) {
      await sendLog('info', `[${site}] step start`, { action: step.action, target: step.target });

      try {
        if (step.action === 'navigate') {
          const url = step.url ?? step.target;
          await navigateTabAndWait(tabId, url);
          stepsExecuted++;
          await sendLog('info', `[${site}] navigated`, { url });

        } else if (step.action === 'wait') {
          try {
            await waitForSelector(tabId, step.target);
            await sendLog('info', `[${site}] selector appeared`, { selector: step.target });
          } catch (waitErr) {
            // Selector not found — page may have different markup; continue to extract anyway
            await sendLog('warn', `[${site}] selector wait failed, continuing`, {
              selector: step.target,
              error: String(waitErr),
            });
          }

        } else if (step.action === 'extract') {
          // Capture page text scoped to the results container when possible
          const text = await capturePageText(tabId, step.target);
          pageText += `\n\n[${site}]\n${text}`;
          stepsExecuted++;
          await sendLog('info', `[${site}] text captured`, {
            selector: step.target,
            chars: text.length,
            // Log first 300 chars — lets us verify in backend logs that this is real scraped content
            preview: text.slice(0, 300),
          });

        } else if (step.action === 'click') {
          const result = await executeStep(step, tabId);
          stepsExecuted++;
          await sendLog(
            result.success ? 'info' : 'warn',
            `[${site}] ${result.success ? 'clicked' : 'click failed'}`,
            { target: step.target, error: result.error },
          );

        } else if (step.action === 'type') {
          const result = await executeStep(step, tabId);
          stepsExecuted++;
          await sendLog(
            result.success ? 'info' : 'warn',
            `[${site}] ${result.success ? 'typed' : 'type failed'}`,
            { target: step.target, value: step.value, error: result.error },
          );

        } else if (step.action === 'scroll') {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.scrollBy(0, window.innerHeight),
          });
          await sendLog('info', `[${site}] scrolled`);
        }
      } catch (e) {
        await sendLog('error', `[${site}] step failed`, { action: step.action, target: step.target, error: String(e) });
      }
    }

    // Final capture if no explicit extract step: grab full page text
    if (!steps.some((s) => s.action === 'extract') && stepsExecuted > 0) {
      try {
        const text = await capturePageText(tabId);
        pageText += `\n\n[${site}]\n${text}`;
        await sendLog('info', `[${site}] fallback page text captured`, { chars: text.length });
      } catch (e) {
        await sendLog('warn', `[${site}] fallback capture failed`, { error: String(e) });
      }
    }

  } finally {
    if (tabId !== null) {
      try { await chrome.tabs.remove(tabId); } catch { /* best effort */ }
      await sendLog('info', `[${site}] tab closed`);
    }
  }

  return { stepsExecuted, pageText };
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
  _tabId: number,  // side-panel tab â€” each site gets its own tab
): Promise<OrchestrationResult> {
  await sendLog('info', 'orchestration start', { goal });

  // 1. Parse intent (sites, filters)
  const intent = parseIntent(goal);
  await sendLog('info', 'intent parsed', { intent: intent.intent, sites: intent.sites, filters: intent.filters });

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
    await sendLog('info', 'prompts loaded');
  } catch (e) {
    await sendLog('error', 'prompt load failed', { error: String(e) });
  }

  // 3. Plan â€” LLM returns per-site steps, no hardcoded site knowledge here
  let sitePlans: SitePlan[] = [];
  try {
    const plan = await planGoal(goal, plannerPrompt);
    sitePlans = plan.sites;
    await sendLog('info', 'plan received', {
      sites: sitePlans.map((s) => ({ site: s.site, steps: s.steps.length })),
    });
  } catch (e) {
    await sendLog('error', 'plan failed', { error: String(e) });
  }

  // Fallback: if planner returned nothing, derive minimal navigate steps from intent
  if (sitePlans.length === 0) {
    const targets = resolveTargets(intent.sites, intent.filters['searchQuery'] ?? goal);
    sitePlans = targets.map((t) => ({
      site: t.site,
      steps: [{ action: 'navigate' as const, url: t.url, target: t.url, description: `Navigate to ${t.site}` }],
    }));
    await sendLog('warn', 'using fallback plan', { sitePlans: sitePlans.map((s) => s.site) });
  }

  // 4. Execute each site in a SEPARATE TAB in parallel
  await sendLog('info', 'execution start', { sitesCount: sitePlans.length });
  const siteResults = await Promise.allSettled(
    sitePlans.map((sp) => runSiteInTab(sp.site, sp.steps)),
  );

  let totalSteps = 0;
  let collectedText = '';
  for (const r of siteResults) {
    if (r.status === 'fulfilled') {
      totalSteps += r.value.stepsExecuted;
      collectedText += r.value.pageText;
    }
  }
  await sendLog('info', 'execution complete', { totalSteps, collectedChars: collectedText.length });

  // 5. Extract products from all collected page text
  let products: Awaited<ReturnType<typeof extractProducts>> = [];
  try {
    products = await extractProducts(collectedText, extractorPrompt);
    await sendLog('info', 'extraction complete', { count: products.length, products });
  } catch (e) {
    await sendLog('error', 'extraction failed', { error: String(e) });
  }

  // 6. Reason and rank
  let reasoning = '';
  let topProducts: unknown[] = [];
  try {
    const result = await reasonAboutProducts(products, intent.filters, reasonerPrompt);
    topProducts = result.topProducts;
    reasoning = result.reasoning;
    await sendLog('info', 'reasoning complete', { topCount: topProducts.length, reasoning, topProducts });
  } catch (e) {
    await sendLog('error', 'reasoning failed', { error: String(e) });
  }

  const summary = topProducts.length > 0
    ? `Top ${topProducts.length} results found.`
    : `Completed ${totalSteps} step(s) across ${sitePlans.length} site(s).`;

  await sendLog('info', 'orchestration complete', { totalSteps, topCount: topProducts.length, summary });

  return {
    success: totalSteps > 0 || topProducts.length > 0,
    summary,
    topProducts,
    reasoning,
    stepsExecuted: totalSteps,
  };
}