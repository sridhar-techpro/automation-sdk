import type { Page, ElementHandle } from 'puppeteer-core';

export async function resolveTextSelector(
  page: Page,
  text: string,
  exact: boolean
): Promise<ElementHandle> {
  const xpathSelector = exact
    ? `::-p-xpath(//*[normalize-space()='${text}'])`
    : `::-p-xpath(//*[contains(text(),'${text}')])`;

  const element = await page.$(xpathSelector);
  if (!element) {
    throw new Error(`No element found with text ${exact ? 'exact' : 'partial'}: "${text}"`);
  }
  return element as ElementHandle;
}
