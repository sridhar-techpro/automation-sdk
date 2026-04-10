import type { Page } from 'puppeteer-core';

export type LoadState = 'domcontentloaded' | 'networkidle';

/**
 * Waits for the page to reach the specified load state.
 *
 * - `domcontentloaded` — waits until document.readyState is 'interactive' or
 *   'complete' (DOM tree parsed, deferred scripts run).
 * - `networkidle` — waits until no network requests have been in-flight for
 *   ~500 ms (suitable for pages that issue XHR / fetch after DOM ready).
 */
export async function waitForLoadState(
  page: Page,
  state: LoadState,
  timeout = 30000,
): Promise<void> {
  if (state === 'domcontentloaded') {
    await waitForDOMReady(page, timeout);
  } else {
    await waitForNetworkIdle(page, timeout, 500);
  }
}

async function waitForDOMReady(page: Page, timeout: number): Promise<void> {
  const already = await page
    .evaluate(() => document.readyState === 'interactive' || document.readyState === 'complete')
    .catch(() => false);
  if (already) return;

  await page.waitForFunction(
    () => document.readyState === 'interactive' || document.readyState === 'complete',
    { timeout },
  );
}

function waitForNetworkIdle(page: Page, timeout: number, idleMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let inflight = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForLoadState('networkidle') timed out after ${timeout}ms`));
    }, timeout);

    function resetIdle(): void {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (inflight === 0) {
        idleTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, idleMs);
      }
    }

    function cleanup(): void {
      clearTimeout(timeoutTimer);
      if (idleTimer) clearTimeout(idleTimer);
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    }

    function onRequest(): void {
      inflight++;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    }

    function onDone(): void {
      inflight = Math.max(0, inflight - 1);
      resetIdle();
    }

    page.on('request', onRequest);
    page.on('requestfinished', onDone);
    page.on('requestfailed', onDone);

    // Start idle timer immediately — if there are already no in-flight requests
    // (e.g. the page has fully loaded), this resolves after idleMs.
    resetIdle();
  });
}
