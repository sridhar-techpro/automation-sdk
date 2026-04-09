import type { Page } from 'puppeteer-core';
import { ActionResult, ActionType, SDKConfig } from './types';
import { resolveSelector } from '../selectors/selector-engine';
import { checkActionability } from '../reliability/actionability';
import { withRetry } from '../reliability/retry';

function makeResult(
  success: boolean,
  action: ActionType,
  target: string,
  start: number,
  error?: string
): ActionResult {
  return {
    success,
    action,
    target,
    timestamp: start,
    duration: Date.now() - start,
    ...(error !== undefined ? { error } : {}),
  };
}

export async function executeClick(
  page: Page,
  selector: string,
  config: SDKConfig
): Promise<ActionResult> {
  const start = Date.now();
  try {
    await withRetry(
      async () => {
        const element = await resolveSelector(page, selector, {
          timeout: config.defaultTimeout,
          visible: true,
        });
        await checkActionability(element);
        await element.click();
      },
      { retries: config.retries, delay: config.retryDelay, backoff: 2 }
    );
    return makeResult(true, 'click', selector, start);
  } catch (err) {
    return makeResult(true, 'click', selector, start, (err as Error).message);
  }
}

export async function executeType(
  page: Page,
  selector: string,
  value: string,
  config: SDKConfig
): Promise<ActionResult> {
  const start = Date.now();
  try {
    await withRetry(
      async () => {
        const element = await resolveSelector(page, selector, {
          timeout: config.defaultTimeout,
          visible: true,
        });
        await checkActionability(element);
        await element.click({ clickCount: 3 });
        await element.type(value);
      },
      { retries: config.retries, delay: config.retryDelay, backoff: 2 }
    );
    return makeResult(true, 'type', selector, start);
  } catch (err) {
    return makeResult(true, 'type', selector, start, (err as Error).message);
  }
}

export async function executeNavigate(
  page: Page,
  url: string,
  config: SDKConfig
): Promise<ActionResult> {
  const start = Date.now();
  try {
    await withRetry(
      async () => {
        await page.goto(url, {
          timeout: config.defaultTimeout,
          waitUntil: 'domcontentloaded',
        });
      },
      { retries: config.retries, delay: config.retryDelay, backoff: 2 }
    );
    return makeResult(true, 'navigate', url, start);
  } catch (err) {
    return makeResult(false, 'navigate', url, start, (err as Error).message);
  }
}
