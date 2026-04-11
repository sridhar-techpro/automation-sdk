/**
 * Reasoner — ranks products and optionally calls /llm for final reasoning.
 */

import type { Product } from './extractor';

export interface ReasoningResult {
  topProducts: Product[];
  reasoning: string;
}

const BACKEND = 'http://127.0.0.1:8000';

export async function reasonAboutProducts(
  products: Product[],
  filters: Record<string, string>,
  promptTemplate: string,
): Promise<ReasoningResult> {
  // Local pre-filter — only exclude a product if we have RELIABLE data that fails the filter.
  // reviews === 0 means "not extracted" (unknown), not "zero reviews" — keep those products.
  let filtered = products.filter((p) => {
    if (filters['minRating'] && p.rating > 0 && p.rating < parseFloat(filters['minRating'])) return false;
    if (filters['minReviews'] && p.reviews > 0 && p.reviews < parseInt(filters['minReviews'], 10)) return false;
    if (p.inStock === false) return false;  // only exclude if explicitly false, not if unknown
    return true;
  });

  // Sort by rating desc, then reviews desc
  filtered.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  const top3 = filtered.slice(0, 3);

  // Send to LLM for intelligent final reasoning (apply remaining goal filters, generate prose)
  if (top3.length > 0) {
    try {
      const prompt = `${promptTemplate}\n\nUser filters: ${JSON.stringify(filters)}\n\nProducts:\n${JSON.stringify(top3, null, 2)}`;
      const resp = await fetch(`${BACKEND}/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (resp.ok) {
        const data = await resp.json() as { response: string };
        return { topProducts: top3, reasoning: data.response };
      }
    } catch { /* use local reasoning */ }
  }

  // Fallback: generate local reasoning
  const reasoning = top3.length > 0
    ? `Top ${top3.length} products selected based on available data (rating: ${filters['minRating'] ?? 'any'}, reviews: ${filters['minReviews'] ?? 'any'}).`
    : 'No products matched the specified filters.';

  return { topProducts: top3, reasoning };
}
