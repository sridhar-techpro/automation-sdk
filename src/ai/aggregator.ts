import { Filters, Product } from './types';

/**
 * Keeps only products that strictly satisfy all active filter criteria:
 *  - price  < priceMax   (if set)
 *  - rating > ratingMin  (if set)
 */
export function filterProducts(products: Product[], filters: Filters): Product[] {
  return products.filter(p => {
    if (filters.priceMax  !== undefined && !(p.price  < filters.priceMax))  return false;
    if (filters.ratingMin !== undefined && !(p.rating > filters.ratingMin)) return false;
    return true;
  });
}

/**
 * Combines results from all sites and returns the top 2 products sorted by:
 *  1. rating  DESC
 *  2. price   ASC  (cheaper wins on a rating tie)
 */
export function aggregateProducts(products: Product[]): Product[] {
  return [...products]
    .sort((a, b) => b.rating - a.rating || a.price - b.price)
    .slice(0, 2);
}
