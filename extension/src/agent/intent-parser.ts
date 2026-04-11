/**
 * IntentParser — converts free-form user text into a structured Goal object.
 */

export interface Goal {
  raw: string;
  intent: 'search' | 'compare' | 'extract' | 'navigate' | 'generic';
  sites: string[];
  filters: Record<string, string>;
}

export function parseIntent(raw: string): Goal {
  const lower = raw.toLowerCase();

  const intent: Goal['intent'] =
    lower.includes('compare') ? 'compare' :
    lower.includes('search') || lower.includes('find') ? 'search' :
    lower.includes('extract') || lower.includes('get') ? 'extract' :
    lower.includes('navigate') || lower.includes('go to') ? 'navigate' :
    'generic';

  const sites: string[] = [];
  if (lower.includes('amazon')) sites.push('amazon');
  if (lower.includes('flipkart')) sites.push('flipkart');

  const filters: Record<string, string> = {};
  const priceMatch = lower.match(/under\s*[₹$]?([\d,]+)/);
  if (priceMatch) filters['maxPrice'] = priceMatch[1].replace(',', '');

  const ratingMatch = lower.match(/([\d.]+)\+\s*rating/);
  if (ratingMatch) filters['minRating'] = ratingMatch[1];

  const reviewMatch = lower.match(/minimum\s*([\d,]+)\s*reviews?/);
  if (reviewMatch) filters['minReviews'] = reviewMatch[1].replace(',', '');

  // Extract a concise search query: take everything up to the first comma or newline,
  // strip known instruction phrases, then trim to first 60 chars
  const firstLine = raw.split(/[,\n]/)[0].trim();
  const cleaned = firstLine
    .replace(/^search\s+(for\s+)?/i, '')
    .replace(/^find\s+/i, '')
    .replace(/\bunder\s*[₹$]?[\d,]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60);
  filters['searchQuery'] = cleaned || firstLine.slice(0, 60);

  return { raw, intent, sites, filters };
}

