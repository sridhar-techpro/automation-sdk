import type { Page, ElementHandle } from 'puppeteer-core';
import { WaitOptions } from '../core/types';
import { resolveSelector } from '../selectors/selector-engine';

export async function waitForElement(
  page: Page,
  selector: string,
  options: WaitOptions
): Promise<ElementHandle> {
  return resolveSelector(page, selector, options);
}

export async function waitForVisible(
  page: Page,
  selector: string,
  timeout: number
): Promise<void> {
  await page.waitForSelector(selector, { visible: true, timeout });
}

export async function waitForNavigation(page: Page, timeout: number): Promise<void> {
  await page.waitForNavigation({ timeout, waitUntil: 'domcontentloaded' });
}
