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

// Handles: under, below, less than, within, budget, upto, up to
// Supports optional "k"/"K" suffix (e.g. 30k → 30000).
// Uses bounded quantifiers to avoid ReDoS on adversarial whitespace inputs.
const PRICE_RE =
  /(?:under|below|less[ \t]+than|within|budget|upto|up[ \t]+to)[ \t]{1,5}(?:rs\.?[ \t]{0,3}|₹[ \t]{0,3}|inr[ \t]{0,3})?(\d[\d,]*)(k)?/i;

function extractPriceMax(lower: string): number | undefined {
  const m = PRICE_RE.exec(lower);
  if (!m) return undefined;
  const raw = parseInt(m[1].replace(/,/g, ''), 10);
  return m[2] ? raw * 1000 : raw;
}

function extractRatingMin(lower: string): number | undefined {
  // "4+ rating" / "4+ stars"
  // Uses non-backtracking literal characters only — no ReDoS risk.
  const plusMatch = /(\d+(?:\.\d+)?)[ \t]*\+[ \t]*(?:rating|stars?)?/.exec(lower);
  if (plusMatch) return parseFloat(plusMatch[1]);

  // "rating above 4" / "rating greater than 4" / "rating >= 4"
  // Bounded whitespace to prevent ReDoS on long whitespace-only strings.
  const stdMatch =
    /(?:rating|stars?)[ \t]{1,5}(?:above|over|greater[ \t]{1,5}than|more[ \t]{1,5}than|[≥>=]+)[ \t]{0,5}(\d+(?:\.\d+)?)/.exec(lower);
  if (stdMatch) return parseFloat(stdMatch[1]);

  // "> 4" or ">= 4" when followed by optional "rating"/"stars"
  // Uses non-overlapping character classes to prevent ReDoS.
  const cmpMatch = /[>≥][ \t]{0,5}=?[ \t]{0,5}(\d+(?:\.\d+)?)[ \t]{0,5}(?:rating|stars?)?/.exec(lower);
  if (cmpMatch) return parseFloat(cmpMatch[1]);

  return undefined;
}

// "fill … form" / "fill out form" / "submit form" — FORM_FILL indicator
const FORM_FILL_RE =
  /\b(?:fill(?:[ \t]+(?:out|in))?[ \t]+(?:the[ \t]+)?(?:\w+[ \t]+)?form|submit[ \t]+(?:the[ \t]+)?form)\b/;

// "find employee", "look up", "lookup", "table record" — TABLE_LOOKUP indicator
const TABLE_LOOKUP_RE =
  /\b(?:employee|look[ \t]*up|lookup|find[ \t]+(?:employee|record|user)|table[ \t]+record)\b/;

function detectType(lower: string): IntentType {
  if (/\b(?:login|sign[- ]in|log[- ]in)\b/.test(lower)) return 'LOGIN';
  if (FORM_FILL_RE.test(lower))                          return 'FORM_FILL';
  if (TABLE_LOOKUP_RE.test(lower))                       return 'TABLE_LOOKUP';
  if (/\b(?:go[ \t]+to|navigate[ \t]+to|open)\b/.test(lower)) return 'NAVIGATE';
  return 'SEARCH_PRODUCT';
}

function extractFilters(lower: string): Filters {
  const filters: Filters = {};

  const priceMax = extractPriceMax(lower);
  if (priceMax !== undefined) filters.priceMax = priceMax;

  const ratingMin = extractRatingMin(lower);
  if (ratingMin !== undefined) filters.ratingMin = ratingMin;

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
 *
 * Supported intent types: SEARCH_PRODUCT, LOGIN, FORM_FILL, NAVIGATE, TABLE_LOOKUP
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
