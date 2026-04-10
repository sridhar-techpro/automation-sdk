import type { Page, Frame, ElementHandle } from 'puppeteer-core';
import { WaitOptions } from '../core/types';

/**
 * Resolves a raw XPath expression (without `::-p-xpath()` wrapper) to a single
 * element, using puppeteer's built-in `::-p-xpath()` custom pseudo.
 */
export async function resolveXPathSelector(
  context: Page | Frame,
  xpath: string,
  options?: WaitOptions,
): Promise<ElementHandle> {
  const selector = `::-p-xpath(${xpath})`;
  const timeout = options?.timeout ?? 30000;

  await context.waitForSelector(selector, { timeout, visible: options?.visible });

  const element = await context.$(selector);
  if (!element) {
    throw new Error(`XPath selector not found: ${xpath}`);
  }
  return element as ElementHandle;
}

/**
 * Resolves a raw XPath to all matching elements (no wait — caller is expected
 * to have ensured the DOM is ready, or use resolveXPathSelector first).
 */
export async function resolveXPathSelectorAll(
  context: Page | Frame,
  xpath: string,
): Promise<ElementHandle[]> {
  const selector = `::-p-xpath(${xpath})`;
  return context.$$(selector) as Promise<ElementHandle[]>;
}
