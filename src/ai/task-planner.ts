import { ExecutionStep, Intent, IntentType, Task } from './types';

const SITE_SEARCH_URL: Record<string, (query: string) => string> = {
  amazon:   q => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
  flipkart: q => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
};

function buildSearchUrl(site: string, query: string): string {
  const builder = SITE_SEARCH_URL[site];
  return builder
    ? builder(query)
    : `https://www.${site}.com/search?q=${encodeURIComponent(query)}`;
}

/**
 * Builds search tasks (one per site) for SEARCH_PRODUCT intents.
 * Each task navigates to a site-specific search URL then extracts products.
 */
function buildSearchTasks(intent: Intent): Task[] {
  const query = intent.filters.query ?? 'product';
  return intent.sites.map(site => {
    const steps: ExecutionStep[] = [
      { action: 'navigate', url: buildSearchUrl(site, query) },
      { action: 'extract' },
    ];
    return { id: `${site}_task`, site, steps };
  });
}

/**
 * Builds a single generic task (no site-specific URL) for non-product intents.
 * Steps are intentionally empty — the caller is responsible for driving the
 * workflow through the SDK's locator system.
 */
function buildGenericTask(type: IntentType): Task {
  const id = type.toLowerCase().replace(/_/g, '-') + '_task';
  return { id, steps: [] };
}

/**
 * Generates one or more Tasks from an Intent.
 *
 * - SEARCH_PRODUCT  → one Task per site (navigate + extract)
 * - LOGIN           → single generic login_task
 * - FORM_FILL       → single generic form-fill_task
 * - TABLE_LOOKUP    → single generic table-lookup_task
 * - NAVIGATE        → single generic navigate_task
 */
export function planTasks(intent: Intent): Task[] {
  if (intent.type === 'SEARCH_PRODUCT') {
    return buildSearchTasks(intent);
  }
  return [buildGenericTask(intent.type)];
}
