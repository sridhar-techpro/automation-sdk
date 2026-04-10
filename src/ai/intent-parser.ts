import { Filters, Intent, IntentType } from './types';

// Ordered longest-first to prevent shorter keywords shadowing longer ones
// (e.g. 'phone' inside 'smartphone').
const PRODUCT_KEYWORDS = [
  'smartphones', 'smartphone',
  'phones', 'phone',
  'laptops', 'laptop',
  'tablets', 'tablet',
  'headphones', 'headphone',
  'cameras', 'camera',
  'tv',
] as const;

const KEYWORD_CANONICAL: Record<string, string> = {
  smartphones: 'smartphone', smartphone: 'smartphone',
  phones:      'smartphone', phone:      'smartphone',
  laptops:     'laptop',     laptop:     'laptop',
  tablets:     'tablet',     tablet:     'tablet',
  headphones:  'headphone',  headphone:  'headphone',
  cameras:     'camera',     camera:     'camera',
  tv:          'tv',
};

const PRICE_RE =
  /(?:under|below|less\s+than|within|upto|up\s+to)\s+(?:rs\.?\s*|₹\s*|inr\s*)?(\d[\d,]*)/i;

const RATING_RE =
  /rating\s+(?:above|over|greater\s+than|more\s+than|[≥>=]+)\s*(\d+(?:\.\d+)?)/i;

function detectType(lower: string): IntentType {
  if (/\b(?:login|sign[- ]in|log[- ]in)\b/.test(lower)) return 'LOGIN';
  if (/\b(?:go\s+to|navigate\s+to|open)\b/.test(lower)) return 'NAVIGATE';
  return 'SEARCH_PRODUCT';
}

function extractFilters(lower: string): Filters {
  const filters: Filters = {};

  const priceMatch = PRICE_RE.exec(lower);
  if (priceMatch) {
    filters.priceMax = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  }

  const ratingMatch = RATING_RE.exec(lower);
  if (ratingMatch) {
    filters.ratingMin = parseFloat(ratingMatch[1]);
  }

  const keyword = PRODUCT_KEYWORDS.find(kw => lower.includes(kw));
  if (keyword) {
    filters.query = KEYWORD_CANONICAL[keyword] ?? keyword;
  }

  return filters;
}

function detectSites(lower: string, type: IntentType): string[] {
  const sites: string[] = [];
  if (lower.includes('amazon'))   sites.push('amazon');
  if (lower.includes('flipkart')) sites.push('flipkart');
  if (sites.length === 0 && type === 'SEARCH_PRODUCT') {
    sites.push('amazon', 'flipkart');
  }
  return sites;
}

/**
 * Deterministically parses a natural-language goal string into a typed Intent.
 * No LLM calls — purely keyword/regex driven.
 */
export function parseIntent(input: string): Intent {
  const lower = input.toLowerCase();
  const type  = detectType(lower);
  return {
    type,
    filters: extractFilters(lower),
    sites:   detectSites(lower, type),
  };
}
