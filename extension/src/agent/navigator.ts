/**
 * Navigator — decides which site(s) to visit and constructs the initial URL.
 */

export type SiteKey = 'amazon' | 'flipkart' | 'generic';

const SITE_SEARCH_URLS: Record<SiteKey, (query: string) => string> = {
  amazon:   (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
  generic:  (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
};

export interface NavigationTarget {
  site: SiteKey;
  url: string;
}

export function resolveTargets(
  sites: string[],
  searchQuery: string,
): NavigationTarget[] {
  const keys: SiteKey[] = sites.length > 0
    ? (sites as SiteKey[])
    : ['generic'];

  return keys.map((site) => ({
    site,
    url: SITE_SEARCH_URLS[site]?.(searchQuery) ?? SITE_SEARCH_URLS.generic(searchQuery),
  }));
}
