import type { ElementHandle } from 'puppeteer-core';
import { ActionabilityOptions } from '../core/types';

export class ActionabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionabilityError';
  }
}

export async function checkActionability(
  element: ElementHandle,
  options: ActionabilityOptions = {},
): Promise<void> {
  const isAttached = await element
    .evaluate((el) => (el as Element).isConnected)
    .catch(() => false);
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

  if (options.checkStability) {
    await checkStability(element);
  }

  if (options.checkCoverage) {
    await checkNotCovered(element);
  }
}

/**
 * Verifies the element's bounding box does not shift between two samples
 * taken 50 ms apart (guards against layout animations / reflows).
 */
async function checkStability(element: ElementHandle): Promise<void> {
  const getRect = () =>
    element
      .evaluate((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })
      .catch(() => null);

  const before = await getRect();
  await new Promise((r) => setTimeout(r, 50));
  const after = await getRect();

  if (!before || !after) {
    throw new ActionabilityError('Element is not stable (could not measure bounding box)');
  }

  if (
    Math.abs(before.x - after.x) > 1 ||
    Math.abs(before.y - after.y) > 1 ||
    Math.abs(before.width - after.width) > 1 ||
    Math.abs(before.height - after.height) > 1
  ) {
    throw new ActionabilityError('Element is not stable (layout shift detected)');
  }
}

/**
 * Verifies the element is not obscured by an overlapping element at its
 * centre point (using document.elementFromPoint).
 */
async function checkNotCovered(element: ElementHandle): Promise<void> {
  const covered = await element
    .evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const top = document.elementFromPoint(cx, cy);
      // The element is "covered" if the topmost element at its centre is
      // neither the element itself nor a descendant of it.
      return top !== null && !el.contains(top);
    })
    .catch(() => false);

  if (covered) {
    throw new ActionabilityError('Element is covered by another element');
  }
}
