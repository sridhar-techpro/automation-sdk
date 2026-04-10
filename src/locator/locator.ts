import type { Page, Frame, ElementHandle } from 'puppeteer-core';
import { SDKConfig, LocatorState } from '../core/types';
import { resolveSelectorAll } from '../selectors/selector-engine';
import { checkActionability } from '../reliability/actionability';
import { withRetry } from '../reliability/retry';

export class Locator {
  private readonly _context: Page | Frame | null;
  /** Async resolver used when context is a lazily-resolved Frame (iframe support). */
  private readonly _contextResolver: (() => Promise<Page | Frame>) | null;
  private readonly _selector: string;
  private readonly _config: SDKConfig;
  private readonly _state: LocatorState;
  /** Parent locator — when set, this locator searches within the parent element. */
  private readonly _parent: Locator | null;

  constructor(
    context: Page | Frame | (() => Promise<Page | Frame>),
    selector: string,
    config: SDKConfig,
    state: LocatorState = {},
    parent: Locator | null = null,
  ) {
    if (typeof context === 'function') {
      this._context = null;
      this._contextResolver = context;
    } else {
      this._context = context;
      this._contextResolver = null;
    }
    this._selector = selector;
    this._config = config;
    this._state = state;
    this._parent = parent;
  }

  // ─── Chainable modifiers ──────────────────────────────────────────────────

  nth(index: number): Locator {
    return new Locator(this._rawContext(), this._selector, this._config, { ...this._state, nth: index }, this._parent);
  }

  first(): Locator {
    return this.nth(0);
  }

  last(): Locator {
    return new Locator(this._rawContext(), this._selector, this._config, { ...this._state, nth: -1 }, this._parent);
  }

  filter(options: { hasText?: string }): Locator {
    return new Locator(this._rawContext(), this._selector, this._config, { ...this._state, hasText: options.hasText }, this._parent);
  }

  locator(childSelector: string): Locator {
    return new Locator(this._rawContext(), childSelector, this._config, {}, this);
  }

  // ─── Resolution ───────────────────────────────────────────────────────────

  private _rawContext(): Page | Frame | (() => Promise<Page | Frame>) {
    return this._contextResolver ?? (this._context as Page | Frame);
  }

  private async _getContext(): Promise<Page | Frame> {
    if (this._contextResolver) return this._contextResolver();
    return this._context as Page | Frame;
  }

  private async _resolveAll(): Promise<ElementHandle[]> {
    if (this._parent) {
      // Resolve within parent element's subtree
      const parentEl = await this._parent.resolve();
      let handles = await parentEl.$$(this._selector) as ElementHandle[];

      if (this._state.hasText !== undefined) {
        const text = this._state.hasText;
        const filtered: ElementHandle[] = [];
        for (const h of handles) {
          const innerText: string = await h.evaluate((el) => el.textContent ?? '').catch(() => '');
          if (innerText.includes(text)) filtered.push(h);
        }
        handles = filtered;
      }
      return handles;
    }

    const ctx = await this._getContext();
    let handles = await resolveSelectorAll(ctx, this._selector, {
      timeout: this._config.defaultTimeout,
    });

    if (this._state.hasText !== undefined) {
      const text = this._state.hasText;
      const filtered: ElementHandle[] = [];
      for (const h of handles) {
        const innerText: string = await h.evaluate((el) => el.textContent ?? '').catch(() => '');
        if (innerText.includes(text)) filtered.push(h);
      }
      handles = filtered;
    }

    return handles;
  }

  /**
   * Resolves the locator to a single ElementHandle.
   * Applies nth / last selection after filtering.
   */
  async resolve(): Promise<ElementHandle> {
    const handles = await this._resolveAll();

    if (handles.length === 0) {
      throw new Error(`Locator found no elements for selector: "${this._selector}"`);
    }

    let idx = this._state.nth ?? 0;
    if (idx === -1) idx = handles.length - 1;

    if (idx < 0 || idx >= handles.length) {
      throw new Error(
        `Locator index ${idx} out of bounds — found ${handles.length} element(s) for "${this._selector}"`,
      );
    }

    return handles[idx];
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async click(): Promise<void> {
    await withRetry(
      async () => {
        const element = await this.resolve();
        await checkActionability(element);
        await element.click();
      },
      { retries: this._config.retries, delay: this._config.retryDelay, backoff: 2 },
    );
  }

  async type(value: string): Promise<void> {
    await withRetry(
      async () => {
        const element = await this.resolve();
        await checkActionability(element);
        await element.click({ clickCount: 3 });
        await element.type(value);
      },
      { retries: this._config.retries, delay: this._config.retryDelay, backoff: 2 },
    );
  }

  async screenshot(): Promise<Buffer> {
    const element = await this.resolve();
    return element.screenshot() as Promise<Buffer>;
  }
}
