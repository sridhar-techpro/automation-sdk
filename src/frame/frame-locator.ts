import type { Page, Frame } from 'puppeteer-core';
import { SDKConfig } from '../core/types';
import { Locator } from '../locator/locator';

/**
 * FrameLocator wraps an iframe element on a page and provides a `.locator()`
 * entry point scoped to that frame's DOM.
 *
 * Resolution is lazy: the iframe is not looked up until an action is triggered
 * on a Locator returned by `.locator()`.
 */
export class FrameLocator {
  private readonly _page: Page;
  private readonly _frameSelector: string;
  private readonly _config: SDKConfig;

  constructor(page: Page, frameSelector: string, config: SDKConfig) {
    this._page = page;
    this._frameSelector = frameSelector;
    this._config = config;
  }

  /**
   * Returns a Locator scoped to the content of the matched iframe.
   */
  locator(selector: string): Locator {
    const frameResolver = async (): Promise<Frame> => {
      const timeout = this._config.defaultTimeout;
      await this._page.waitForSelector(this._frameSelector, { timeout });
      const el = await this._page.$(this._frameSelector);
      if (!el) throw new Error(`Frame element not found: ${this._frameSelector}`);
      const frame = await el.contentFrame();
      if (!frame) throw new Error(`Cannot get content frame for: ${this._frameSelector}`);
      return frame;
    };
    return new Locator(frameResolver, selector, this._config);
  }
}
