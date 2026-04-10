import type { Browser, Page } from 'puppeteer-core';
import puppeteerCore from 'puppeteer-core';
import { withRetry } from '../reliability/retry';

export class PuppeteerAdapter {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async connect(wsEndpoint: string, timeout = 30000): Promise<void> {
    const connectWithTimeout = (): Promise<Browser> => {
      const connectPromise = puppeteerCore.connect({ browserWSEndpoint: wsEndpoint });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Browser connection timed out after ${timeout}ms`)),
          timeout,
        ),
      );
      return Promise.race([connectPromise, timeoutPromise]);
    };

    this.browser = await withRetry(connectWithTimeout, { retries: 3, delay: 500, backoff: 2 });

    // Null out internal references when the browser WebSocket connection drops
    // unexpectedly (e.g. browser crash, network loss).  isConnected() will then
    // return false and callers can decide to reconnect.
    this.browser.on('disconnected', () => {
      console.debug('[PuppeteerAdapter] Browser disconnected — clearing references');
      this.browser = null;
      this.page = null;
    });

    // Clear the cached page whenever any target is destroyed so that the next
    // call to getPage() triggers the recovery path instead of returning a
    // reference to a closed page.
    this.browser.on('targetdestroyed', () => {
      if (this.page?.isClosed()) {
        console.debug('[PuppeteerAdapter] Tracked page destroyed — clearing page reference');
        this.page = null;
      }
    });

    const pages = await this.browser.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
  }

  getBrowser(): Browser {
    if (!this.browser) throw new Error('Not connected to browser');
    return this.browser;
  }

  /**
   * Returns the current page, recovering automatically if the previously
   * cached page has been closed or destroyed.  The recovered page is a
   * fresh blank page ready for navigation.
   */
  async getPage(): Promise<Page> {
    if (!this.browser) throw new Error('Not connected to browser');

    if (!this.page || this.page.isClosed()) {
      // Try to reuse an existing open page before creating a new one.
      const pages = await this.browser.pages();
      const open = pages.filter((p) => !p.isClosed());
      this.page = open.length > 0 ? open[0] : await this.browser.newPage();
    }

    return this.page;
  }

  async newPage(): Promise<Page> {
    const browser = this.getBrowser();
    this.page = await browser.newPage();
    return this.page;
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
      this.page = null;
    }
  }

  isConnected(): boolean {
    return !!this.browser?.isConnected();
  }
}
