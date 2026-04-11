import type { Page } from 'puppeteer-core';
import { waitForLoadState } from '../reliability/load-state';
import { withRetry } from '../reliability/retry';

export interface StabilizationOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/** BEFORE: wait for DOM ready then wait for the element to appear. */
export async function stabilizeBefore(
  page: Page,
  selector: string,
  options: StabilizationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 15000;
  await waitForLoadState(page, 'domcontentloaded', timeout);
  await page.waitForSelector(selector, { timeout }).catch(() => {});
}

/** DURING: wrap an action with retry + backoff. */
export async function stabilizeDuring<T>(
  action: () => Promise<T>,
  options: StabilizationOptions = {},
): Promise<T> {
  return withRetry(action, {
    retries: options.retries ?? 3,
    delay: options.retryDelay ?? 300,
    backoff: 1.5,
  });
}

/** AFTER: wait for the next stable state. */
export async function stabilizeAfter(
  page: Page,
  targetSelector?: string,
  options: StabilizationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 10000;
  if (targetSelector) {
    await page.waitForSelector(targetSelector, { timeout }).catch(() => {});
  } else {
    await waitForLoadState(page, 'domcontentloaded', timeout).catch(() => {});
  }
}
