import type { Page, ElementHandle } from 'puppeteer-core';
import { WaitOptions } from '../core/types';

const DEFAULT_TEXT_TIMEOUT = 30000;

/**
 * Escapes arbitrary text for safe embedding inside an XPath string literal.
 * XPath has no backslash escaping, so single quotes are handled via concat().
 */
function escapeXPathText(text: string): string {
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!text.includes('"')) {
    return `"${text}"`;
  }
  // Both quote types present — build a concat() expression
  const parts = text.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(", \"'\", ")})`;
}

export async function resolveTextSelector(
  page: Page,
  text: string,
  exact: boolean,
  options?: WaitOptions
): Promise<ElementHandle> {
  const escaped = escapeXPathText(text);
  const xpathSelector = exact
    ? `::-p-xpath(//*[normalize-space()=${escaped}])`
    : `::-p-xpath(//*[contains(text(),${escaped})])`;

  const timeout = options?.timeout ?? DEFAULT_TEXT_TIMEOUT;
  await page.waitForSelector(xpathSelector, { timeout, visible: options?.visible });

  const element = await page.$(xpathSelector);
  if (!element) {
    throw new Error(`No element found with text ${exact ? 'exact' : 'partial'}: "${text}"`);
  }
  return element as ElementHandle;
}
