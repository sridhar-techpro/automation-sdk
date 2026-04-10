import { ExecutionStep, Intent, Task } from './types';

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
 * Generates one Task per site in the Intent, each with a navigate + extract
 * execution plan.
 */
export function planTasks(intent: Intent): Task[] {
  const query = intent.filters.query ?? 'smartphone';
  return intent.sites.map(site => {
    const steps: ExecutionStep[] = [
      { action: 'navigate', url: buildSearchUrl(site, query) },
      { action: 'extract' },
    ];
    return { id: `${site}_task`, site, steps };
  });
}
