import type { Page, Frame, ElementHandle } from 'puppeteer-core';
import { WaitOptions } from '../core/types';

export async function resolveCSSSelector(
  page: Page | Frame,
  selector: string,
  options?: WaitOptions
): Promise<ElementHandle> {
  const timeout = options?.timeout ?? 30000;
  const visible = options?.visible ?? false;

  await page.waitForSelector(selector, { timeout, visible });

  const element = await page.$(selector);
  if (!element) {
    throw new Error(`CSS selector not found: ${selector}`);
  }
  return element;
}
