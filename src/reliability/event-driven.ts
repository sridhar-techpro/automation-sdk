import type { Page, ElementHandle } from 'puppeteer-core';

export interface WaitForElementAfterActionOptions {
  /** Maximum ms to wait for the target element. Default: 30 000. */
  timeout?: number;
}

/**
 * Executes `action` and waits for `targetSelector` to become visible in the
 * DOM.  The wait is started *before* the action to eliminate any race between
 * the action completing and the element appearing.
 *
 * Typical use-cases:
 *  - Click a button → dropdown/modal appears → return the new element
 *  - Change a select → dependent field appears → return the field
 *  - Submit a form → success message appears → return the message element
 */
export async function waitForElementAfterAction(
  page: Page,
  action: () => Promise<void>,
  targetSelector: string,
  options: WaitForElementAfterActionOptions = {},
): Promise<ElementHandle> {
  const timeout = options.timeout ?? 30000;

  // Arm the wait BEFORE performing the action so we never miss a fast UI update.
  const waitPromise = page.waitForSelector(targetSelector, { timeout, visible: true });
  await action();
  const handle = await waitPromise;

  if (!handle) {
    throw new Error(
      `waitForElementAfterAction: element not found after action — selector: "${targetSelector}"`,
    );
  }
  return handle as ElementHandle;
}

/**
 * Waits for at least one DOM mutation (child-list change, attribute update, or
 * character-data change) anywhere in `document.body`.
 *
 * Useful as a lightweight "something changed" signal after dispatching an
 * event or performing an action, without knowing the specific selector.
 */
export async function waitForDOMChange(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;

  await page.evaluate((ms: number): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('waitForDOMChange timed out'));
      }, ms);

      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    });
  }, timeout);
}
