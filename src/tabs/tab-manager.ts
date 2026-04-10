import type { Browser, Page } from 'puppeteer-core';

/**
 * TabManager provides multi-tab orchestration on an already-running browser.
 *
 * It operates on the browser's existing pages; it never spawns new ones
 * (in keeping with the CDP-only, extension-compatible architecture).
 */
export class TabManager {
  private readonly _browser: Browser;

  constructor(browser: Browser) {
    this._browser = browser;
  }

  /**
   * Returns all currently open pages/tabs in the browser.
   */
  async getTabs(): Promise<Page[]> {
    return this._browser.pages();
  }

  /**
   * Switches the "active" tab reference to the tab at the given index and
   * returns that Page.
   *
   * Note: in headless Chrome calling `page.bringToFront()` can trigger
   * `Runtime.executionContextsCleared` on sibling tabs.  This method
   * intentionally does NOT call bringToFront(); it simply returns the Page so
   * callers can drive it via CDP.
   */
  async switchToTab(index: number): Promise<Page> {
    const pages = await this._browser.pages();
    if (index < 0 || index >= pages.length) {
      throw new Error(
        `Tab index ${index} is out of bounds — browser has ${pages.length} open tab(s)`,
      );
    }
    return pages[index];
  }

  /**
   * Executes an arbitrary async action on the tab at the given index.
   *
   * @param index  Zero-based tab index.
   * @param action Async callback that receives the Page for that tab.
   */
  async executeOnTab<T>(index: number, action: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.switchToTab(index);
    return action(page);
  }
}
