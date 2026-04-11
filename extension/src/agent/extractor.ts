/**
 * Extractor — asks backend /llm to parse product data from page HTML.
 */

export interface Product {
  name: string;
  price: string;
  rating: number;
  reviews: number;
  inStock: boolean;
}

const BACKEND = 'http://127.0.0.1:8000';

export async function extractProducts(
  pageHtml: string,
  promptTemplate: string,
): Promise<Product[]> {
  const prompt = `${promptTemplate}\n\nPage HTML (first 4000 chars):\n${pageHtml.slice(0, 4000)}`;

  const resp = await fetch(`${BACKEND}/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) return [];

  const data = await resp.json() as { response: string };
  try {
    return JSON.parse(data.response) as Product[];
  } catch {
    return [];
  }
}
