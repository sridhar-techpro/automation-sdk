import type { Browser, Page } from 'puppeteer-core';
import puppeteerCore from 'puppeteer-core';
import { withRetry } from '../reliability/retry';

export class PuppeteerAdapter {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async connect(wsEndpoint: string): Promise<void> {
    this.browser = await withRetry(
      () => puppeteerCore.connect({ browserWSEndpoint: wsEndpoint }),
      { retries: 3, delay: 500, backoff: 2 }
    );
    const pages = await this.browser.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
  }

  getBrowser(): Browser {
    if (!this.browser) throw new Error('Not connected to browser');
    return this.browser;
  }

  getPage(): Page {
    if (!this.page) throw new Error('No page available');
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
    return this.browser !== null;
  }
}
