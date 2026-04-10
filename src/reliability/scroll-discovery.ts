import type { Page, ElementHandle } from 'puppeteer-core';
import { resolveSelector } from '../selectors/selector-engine';

export interface ScrollDiscoveryOptions {
  /** Total search budget in milliseconds. Default: 30 000. */
  timeout?: number;
  /** Pixels to scroll per step. Default: 300. */
  scrollStep?: number;
  /** Maximum number of scroll steps before giving up. Default: 20. */
  maxScrolls?: number;
  /** Milliseconds to wait after each scroll step (allows lazy content to render). Default: 200. */
  waitAfterScroll?: number;
}

/**
 * Searches for `selector` in the current viewport; if not found, scrolls the
 * page down incrementally and retries after each step.  Stops as soon as the
 * element is located or the scroll/time budget is exhausted.
 *
 * This is the primary tool for:
 *  - elements that are inserted into the DOM by a scroll-event / IntersectionObserver
 *  - elements deep below the initial viewport that require scrolling to reach
 */
export async function findElementWithScroll(
  page: Page,
  selector: string,
  options: ScrollDiscoveryOptions = {},
): Promise<ElementHandle> {
  const {
    timeout = 30000,
    scrollStep = 300,
    maxScrolls = 20,
    waitAfterScroll = 200,
  } = options;

  const deadline = Date.now() + timeout;

  // Try before any scrolling.
  const immediate = await tryFind(page, selector);
  if (immediate) return immediate;

  for (let i = 0; i < maxScrolls; i++) {
    if (Date.now() > deadline) break;

    await page.evaluate((step: number) => window.scrollBy(0, step), scrollStep);
    await new Promise<void>((r) => setTimeout(r, waitAfterScroll));

    const found = await tryFind(page, selector);
    if (found) return found;
  }

  throw new Error(
    `findElementWithScroll: element not found after scrolling — selector: "${selector}"`,
  );
}

async function tryFind(page: Page, selector: string): Promise<ElementHandle | null> {
  try {
    return await resolveSelector(page, selector, { timeout: 500 });
  } catch {
    return null;
  }
}

/**
 * Scrolls the element into the browser viewport if any part of it is currently
 * outside the visible area.  Uses `behavior: 'instant'` to avoid animation
 * delays in tests.
 */
export async function scrollIntoViewIfNeeded(element: ElementHandle): Promise<void> {
  await element.evaluate((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const inView =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);
    if (!inView) {
      (el as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  });
}
