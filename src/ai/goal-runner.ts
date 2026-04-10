import type { Page } from 'puppeteer-core';
import { GoalResult, Product } from './types';
import { parseIntent } from './intent-parser';
import { planTasks } from './task-planner';
import { executeTask } from './executor';
import { filterProducts, aggregateProducts } from './aggregator';

/**
 * Runs the full AI-native pipeline for a natural-language goal:
 *
 *   parse intent → plan tasks → execute tasks → filter → aggregate
 *
 * `getPage` is a factory that returns the active browser page.  Accepting a
 * factory instead of a `Page` directly makes the function straightforwardly
 * testable with a mock page.
 */
export async function runGoal(
  input: string,
  getPage: () => Promise<Page>,
): Promise<GoalResult> {
  const intent = parseIntent(input);
  const tasks  = planTasks(intent);
  const page   = await getPage();

  const allProducts: Product[] = [];
  for (const task of tasks) {
    const products = await executeTask(task, page);
    allProducts.push(...products);
  }

  const filtered  = filterProducts(allProducts, intent.filters);
  const products  = aggregateProducts(filtered);

  return { intent, products };
}
