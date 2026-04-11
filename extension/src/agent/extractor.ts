/**
 * Extractor — asks backend /llm to parse product data from page HTML.
 */

export interface Product {
  name: string;
  price: string;
  rating: number;
  reviews: number;
  inStock: boolean;
  source?: string;
}

const BACKEND = 'http://127.0.0.1:8000';

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGroundedProduct(product: Product, normalizedPageText: string): boolean {
  const normalizedName = normalizeForMatch(product.name);
  if (!normalizedName) return false;
  return normalizedPageText.includes(normalizedName);
}

function groundProducts(products: Product[], pageText: string): Product[] {
  const normalizedPageText = normalizeForMatch(pageText);
  return products.filter((product) => isGroundedProduct(product, normalizedPageText));
}

export async function extractProducts(
  pageText: string,
  promptTemplate: string,
): Promise<Product[]> {
  if (!pageText.trim()) return [];

  // Cap at 8 KB — product listings are near the top; this keeps LLM latency low.
  const cappedText = pageText.slice(0, 8_000);

  // Strict grounding: the LLM must only extract from the provided text
  const groundingInstruction = [
    'IMPORTANT: Extract ONLY items explicitly listed in the page text below.',
    'Do NOT use training knowledge. Do NOT invent any names, prices, or ratings.',
    'Every returned item name must be copied from the page text verbatim or near-verbatim.',
    'If no products are visible in the text, return an empty array: []',
    '',
  ].join('\n');

  const prompt = `${promptTemplate}\n\n${groundingInstruction}Page text (scraped via innerText):\n${cappedText}`;

  const resp = await fetch(`${BACKEND}/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) return [];

  const data = await resp.json() as { response: string };
  try {
    let jsonStr = data.response.trim();
    // Strip markdown code fences that some LLMs add around JSON
    const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/s);
    if (fence) jsonStr = fence[1].trim();

    const raw: unknown = JSON.parse(jsonStr);

    // Format A: plain array  →  [{name, price, rating, reviews, inStock}, ...]
    if (Array.isArray(raw)) return groundProducts(raw as Product[], cappedText);

    // Format B: {items: [...]}  →  legacy extractor output
    if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['items'])) {
      const items = (raw as { items: Record<string, unknown>[] }).items;
      return groundProducts(items.map((item) => {
        const attrs = (item['attributes'] as Record<string, string> | undefined) ?? {};
        return {
          name:    String(item['title']  ?? item['name']  ?? ''),
          price:   String(attrs['price']   ?? item['price']   ?? ''),
          rating:  parseFloat(String(attrs['rating']  ?? item['rating']  ?? '0')),
          reviews: parseInt(String(attrs['reviews'] ?? item['reviews'] ?? '0'), 10),
          inStock: String(attrs['inStock'] ?? item['inStock'] ?? 'true') !== 'false',
        };
      }), cappedText);
    }

    return [];
  } catch {
    return [];
  }
}
