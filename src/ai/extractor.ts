import type { Page } from 'puppeteer-core';
import { Product } from './types';

/**
 * Returns the text content of the first `<span>` (or `<div>`) element whose
 * `class` attribute contains the given CSS class name.
 */
function getElementText(html: string, cls: string): string | undefined {
  // Matches both <span> and <div> to be tolerant of minor HTML variations.
  const re = new RegExp(
    `<(?:span|div)\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([^<]*)<\\/(?:span|div)>`,
    'i',
  );
  return re.exec(html)?.[1].trim() ?? undefined;
}

/**
 * Pure function — parses mock/real HTML without requiring a browser.
 *
 * Expected markup (one `<article class="product-item">` per product):
 * ```html
 * <article class="product-item">
 *   <span class="product-title">Phone Name</span>
 *   <span class="product-price">25000</span>
 *   <span class="product-rating">4.5</span>
 * </article>
 * ```
 */
export function extractProductsFromHTML(html: string, site?: string): Product[] {
  const products: Product[] = [];
  const articleRe =
    /<article\b[^>]*class="[^"]*\bproduct-item\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;

  let match: RegExpExecArray | null;
  while ((match = articleRe.exec(html)) !== null) {
    const block    = match[1];
    const title    = getElementText(block, 'product-title');
    const priceStr = getElementText(block, 'product-price');
    const ratingStr = getElementText(block, 'product-rating');

    if (!title || !priceStr || !ratingStr) continue;

    const price  = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    const rating = parseFloat(ratingStr.split(/\s/)[0]);

    if (isNaN(price) || isNaN(rating)) continue;

    products.push({ title, price, rating, site });
  }

  return products;
}

/**
 * Extracts products from a live browser page by reading page.content() and
 * delegating to {@link extractProductsFromHTML}.
 */
export async function extractProducts(page: Page, site?: string): Promise<Product[]> {
  const html = await page.content();
  return extractProductsFromHTML(html, site);
}
