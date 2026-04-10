import type { Page } from 'puppeteer-core';
import { PuppeteerAdapter } from './puppeteer-adapter';
import { withRetry } from '../reliability/retry';

const DEFAULT_ENDPOINT = 'ws://localhost:9222';

export class ConnectionManager {
  private adapter: PuppeteerAdapter;
  private endpoint: string;
  private connected: boolean = false;

  constructor(endpoint: string = DEFAULT_ENDPOINT) {
    this.endpoint = endpoint;
    this.adapter = new PuppeteerAdapter();
  }

  async connect(): Promise<void> {
    await withRetry(() => this.adapter.connect(this.endpoint), {
      retries: 3,
      delay: 500,
      backoff: 2,
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    this.connected = false;
  }

  async getPage(): Promise<Page> {
    return this.adapter.getPage();
  }

  isConnected(): boolean {
    return this.connected && this.adapter.isConnected();
  }
}
