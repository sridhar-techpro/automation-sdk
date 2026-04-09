import type { Page, ElementHandle } from 'puppeteer-core';
import { ParsedSelector, SelectorType, WaitOptions } from '../core/types';
import { resolveCSSSelector } from './css-selector';
import { resolveTextSelector } from './text-selector';

export function parseSelector(selector: string): ParsedSelector {
  if (selector.startsWith('text*=')) {
    return { type: 'text-partial' as SelectorType, value: selector.slice(6) };
  }
  if (selector.startsWith('text=')) {
    return { type: 'text-exact' as SelectorType, value: selector.slice(5) };
  }
  return { type: 'css' as SelectorType, value: selector };
}

export async function resolveSelector(
  page: Page,
  selector: string,
  options?: WaitOptions
): Promise<ElementHandle> {
  const parsed = parseSelector(selector);

  switch (parsed.type) {
    case 'text-exact':
      return resolveTextSelector(page, parsed.value, true);
    case 'text-partial':
      return resolveTextSelector(page, parsed.value, false);
    case 'css':
    default:
      return resolveCSSSelector(page, parsed.value, options);
  }
}
