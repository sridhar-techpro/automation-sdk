import type { Page, ElementHandle } from 'puppeteer-core';
import { WaitOptions } from '../core/types';

const DEFAULT_TEXT_TIMEOUT = 30000;

export async function resolveTextSelector(
  page: Page,
  text: string,
  exact: boolean,
  options?: WaitOptions
): Promise<ElementHandle> {
  const xpathSelector = exact
    ? `::-p-xpath(//*[normalize-space()='${text}'])`
    : `::-p-xpath(//*[contains(text(),'${text}')])`;

  const timeout = options?.timeout ?? DEFAULT_TEXT_TIMEOUT;
  await page.waitForSelector(xpathSelector, { timeout, visible: options?.visible });

  const element = await page.$(xpathSelector);
  if (!element) {
    throw new Error(`No element found with text ${exact ? 'exact' : 'partial'}: "${text}"`);
  }
  return element as ElementHandle;
}
