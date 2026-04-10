import type { Page, ElementHandle } from 'puppeteer-core';
import { resolveSelector, resolveSelectorAll } from '../selectors/selector-engine';
import { buildRoleSelector } from '../selectors/advanced-selectors';
import { findElementWithScroll } from './scroll-discovery';

// ─── Candidate Discovery ─────────────────────────────────────────────────────

export interface CandidateScore {
  element: ElementHandle;
  /** Higher is better. Computed from visibility, viewport presence, and enabled state. */
  score: number;
}

/**
 * Resolves *all* elements matching `selector` and returns them ranked by a
 * heuristic score that favours visible, in-viewport, enabled elements.
 *
 * Use this when multiple elements could match a selector and you want to
 * interact with the best candidate (e.g. the most visible one).
 */
export async function discoverCandidates(
  page: Page,
  selector: string,
  options: { timeout?: number } = {},
): Promise<CandidateScore[]> {
  const timeout = options.timeout ?? 5000;

  let handles: ElementHandle[];
  try {
    handles = await resolveSelectorAll(page, selector, { timeout });
  } catch {
    return [];
  }

  const scored: CandidateScore[] = [];
  for (const el of handles) {
    const score = await scoreElement(el);
    scored.push({ element: el, score });
  }

  return scored.sort((a, b) => b.score - a.score);
}

async function scoreElement(element: ElementHandle): Promise<number> {
  return element
    .evaluate((el) => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      const rect = htmlEl.getBoundingClientRect();
      let score = 0;

      // Basic CSS visibility
      if (style.display !== 'none') score += 2;
      if (style.visibility !== 'hidden') score += 2;
      if (parseFloat(style.opacity) > 0) score += 1;

      // Non-zero dimensions
      if (rect.width > 0 && rect.height > 0) score += 2;

      // Fully inside viewport
      if (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      ) {
        score += 3;
      }

      // Not disabled
      const inputEl = el as HTMLInputElement;
      if (!('disabled' in inputEl) || !inputEl.disabled) score += 2;

      return score;
    })
    .catch(() => 0);
}

// ─── Progressive Discovery ────────────────────────────────────────────────────

export interface ProgressiveDiscoveryOptions {
  /** Total budget for the entire discovery run. Default: 30 000 ms. */
  timeout?: number;
  /**
   * Partial text to try when the exact selector fails.
   * Translated to a `text*=<partialText>` query.
   */
  partialText?: string;
  /**
   * ARIA role to try when both selector and text-based fallbacks fail.
   * Translated via `buildRoleSelector(role)`.
   */
  role?: string;
  /**
   * Whether to attempt scroll-based discovery as the last resort.
   * Default: true.
   */
  scrollDiscovery?: boolean;
}

/**
 * Progressive discovery engine: tries increasingly broad strategies to locate
 * an element, returning as soon as any strategy succeeds.
 *
 * Strategy order:
 *  1. Quick attempt — original selector with a short 2 s timeout.
 *  2. Full-timeout retry — original selector with the full timeout.
 *  3. Partial text match — `text*=<partialText>` (if `options.partialText` given).
 *  4. Role-based selector — `buildRoleSelector(role)` (if `options.role` given).
 *  5. Scroll discovery — `findElementWithScroll` (unless `scrollDiscovery: false`).
 */
export async function progressiveDiscover(
  page: Page,
  selector: string,
  options: ProgressiveDiscoveryOptions = {},
): Promise<ElementHandle> {
  const timeout = options.timeout ?? 30000;

  // Strategy 1 — quick try (up to 2 s)
  try {
    return await resolveSelector(page, selector, { timeout: Math.min(timeout, 2000) });
  } catch { /* fall through */ }

  // Strategy 2 — full timeout
  try {
    return await resolveSelector(page, selector, { timeout });
  } catch { /* fall through */ }

  // Strategy 3 — partial text match
  if (options.partialText) {
    try {
      return await resolveSelector(page, `text*=${options.partialText}`, { timeout: 3000 });
    } catch { /* fall through */ }
  }

  // Strategy 4 — role-based
  if (options.role) {
    try {
      return await resolveSelector(page, buildRoleSelector(options.role), { timeout: 3000 });
    } catch { /* fall through */ }
  }

  // Strategy 5 — scroll discovery
  if (options.scrollDiscovery !== false) {
    return findElementWithScroll(page, selector, {
      timeout: Math.min(timeout, 10000),
    });
  }

  throw new Error(
    `progressiveDiscover: element not found after all strategies — selector: "${selector}"`,
  );
}
