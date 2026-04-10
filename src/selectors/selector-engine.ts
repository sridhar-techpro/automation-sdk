import type { Page, Frame, ElementHandle } from 'puppeteer-core';
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
  // Explicit xpath= prefix or bare XPath starting with / or //
  if (selector.startsWith('xpath=')) {
    return { type: 'xpath' as SelectorType, value: selector.slice(6) };
  }
  if (selector.startsWith('//') || selector.startsWith('(//')  ) {
    return { type: 'xpath' as SelectorType, value: selector };
  }
  // Shadow DOM traversal (shadow=<css-selector>)
  if (selector.startsWith('shadow=')) {
    return { type: 'shadow' as SelectorType, value: selector.slice(7) };
  }
  return { type: 'css' as SelectorType, value: selector };
}

/**
 * Traverses shadow roots recursively via JS to find an element matching `selector`.
 */
async function resolveShadowSelector(
  page: Page | Frame,
  selector: string,
  options?: WaitOptions,
): Promise<ElementHandle> {
  const timeout = options?.timeout ?? 30000;
  const deadline = Date.now() + timeout;

  const poll = async (): Promise<ElementHandle | null> => {
    const handle = await page.evaluateHandle((sel: string) => {
      function queryDeep(root: Document | ShadowRoot | Element, css: string): Element | null {
        const direct = (root as Element | Document).querySelector(css);
        if (direct) return direct;
        const all = Array.from(root.querySelectorAll('*'));
        for (const el of all) {
          if (el.shadowRoot) {
            const found = queryDeep(el.shadowRoot, css);
            if (found) return found;
          }
        }
        return null;
      }
      return queryDeep(document, sel);
    }, selector);
    const el = handle.asElement();
    return el as ElementHandle | null;
  };

  while (Date.now() < deadline) {
    const el = await poll();
    if (el) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Shadow DOM element not found: ${selector}`);
}

/**
 * Resolves a selector to a single ElementHandle on a Page or Frame.
 */
export async function resolveSelector(
  page: Page | Frame,
  selector: string,
  options?: WaitOptions,
): Promise<ElementHandle> {
  const parsed = parseSelector(selector);

  switch (parsed.type) {
    case 'text-exact':
      return resolveTextSelector(page, parsed.value, true, options);
    case 'text-partial':
      return resolveTextSelector(page, parsed.value, false, options);
    case 'xpath': {
      // Wrap raw XPath in ::-p-xpath() and use the CSS path
      const wrapped = `::-p-xpath(${parsed.value})`;
      return resolveCSSSelector(page, wrapped, options);
    }
    case 'shadow':
      return resolveShadowSelector(page, parsed.value, options);
    case 'css':
    default:
      return resolveCSSSelector(page, parsed.value, options);
  }
}

/**
 * Returns ALL elements matching the selector on a Page, Frame, or within an
 * ElementHandle's subtree.  A Page/Frame will also wait for the first match
 * before querying all; an ElementHandle context queries immediately.
 */
export async function resolveSelectorAll(
  context: Page | Frame | ElementHandle,
  selector: string,
  options?: WaitOptions,
): Promise<ElementHandle[]> {
  const isPageOrFrame =
    typeof (context as { waitForSelector?: unknown }).waitForSelector === 'function';

  if (isPageOrFrame) {
    const pageOrFrame = context as Page | Frame;
    // Wait for at least the first element to appear
    await resolveSelector(pageOrFrame, selector, options);
  }

  const parsed = parseSelector(selector);

  if (parsed.type === 'shadow') {
    // Shadow DOM: only single-element resolution is supported via poll
    const single = await resolveShadowSelector(context as Page | Frame, parsed.value, options);
    return [single];
  }

  let puppeteerSelector: string;
  switch (parsed.type) {
    case 'text-exact': {
      const escaped = escapeXPathText(parsed.value);
      puppeteerSelector = `::-p-xpath(//*[normalize-space()=${escaped}])`;
      break;
    }
    case 'text-partial': {
      const escaped = escapeXPathText(parsed.value);
      puppeteerSelector = `::-p-xpath(//*[contains(text(),${escaped})])`;
      break;
    }
    case 'xpath':
      puppeteerSelector = `::-p-xpath(${parsed.value})`;
      break;
    case 'css':
    default:
      puppeteerSelector = parsed.value;
      break;
  }

  return context.$$(puppeteerSelector) as Promise<ElementHandle[]>;
}

/** Duplicated from text-selector.ts to avoid circular dependency. */
function escapeXPathText(text: string): string {
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  const parts = text.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(", \"'\", ")})`;
}

