import type { ElementHandle } from 'puppeteer-core';

export class ActionabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionabilityError';
  }
}

export async function checkActionability(element: ElementHandle): Promise<void> {
  const isAttached = await element.evaluate((el) => document.contains(el)).catch(() => false);
  if (!isAttached) {
    throw new ActionabilityError('Element is not attached to the DOM');
  }

  const isVisible = await element
    .evaluate((el) => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        htmlEl.offsetWidth > 0 &&
        htmlEl.offsetHeight > 0
      );
    })
    .catch(() => false);

  if (!isVisible) {
    throw new ActionabilityError('Element is not visible');
  }

  const isDisabled = await element
    .evaluate((el) => {
      const inputEl = el as HTMLInputElement | HTMLButtonElement;
      return 'disabled' in inputEl && inputEl.disabled === true;
    })
    .catch(() => false);

  if (isDisabled) {
    throw new ActionabilityError('Element is disabled');
  }
}
