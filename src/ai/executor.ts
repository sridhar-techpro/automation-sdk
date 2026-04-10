import type { Page } from 'puppeteer-core';
import { Product, Task } from './types';
import { extractProducts } from './extractor';

const NAVIGATE_TIMEOUT_MS = 30_000;

/**
 * Executes all steps in a Task sequentially on the supplied page and returns
 * the extracted products.
 *
 * Step semantics:
 *  - `navigate` — calls page.goto() with the step's URL.
 *  - `extract`  — calls extractProducts() and returns immediately.
 */
export async function executeTask(task: Task, page: Page): Promise<Product[]> {
  for (const step of task.steps) {
    if (step.action === 'navigate' && step.url) {
      await page.goto(step.url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATE_TIMEOUT_MS,
      });
    } else if (step.action === 'extract') {
      return extractProducts(page, task.site);
    }
  }
  return [];
}
