import type { Page } from 'puppeteer-core';
import { parseIntent } from '../../src/ai/intent-parser';
import { planTasks } from '../../src/ai/task-planner';
import { extractProductsFromHTML } from '../../src/ai/extractor';
import { executeTask } from '../../src/ai/executor';
import { filterProducts, aggregateProducts } from '../../src/ai/aggregator';
import { runGoal } from '../../src/ai/goal-runner';
import type { Product } from '../../src/ai/types';

// ─── Shared mock HTML ─────────────────────────────────────────────────────────
//
// Four products:
//   Samsung Galaxy S23 — price 28000, rating 4.5  → PASSES  (price<30k, rating>4)
//   OnePlus 12         — price 32000, rating 4.6  → FAILS   (price>30k)
//   Pixel 8a           — price 25000, rating 4.3  → PASSES  (price<30k, rating>4)
//   Redmi Note 13      — price 18000, rating 3.8  → FAILS   (rating≤4)
const MOCK_HTML = `
<article class="product-item">
  <span class="product-title">Samsung Galaxy S23</span>
  <span class="product-price">28000</span>
  <span class="product-rating">4.5</span>
</article>
<article class="product-item">
  <span class="product-title">OnePlus 12</span>
  <span class="product-price">32000</span>
  <span class="product-rating">4.6</span>
</article>
<article class="product-item">
  <span class="product-title">Pixel 8a</span>
  <span class="product-price">25000</span>
  <span class="product-rating">4.3</span>
</article>
<article class="product-item">
  <span class="product-title">Redmi Note 13</span>
  <span class="product-price">18000</span>
  <span class="product-rating">3.8</span>
</article>
`;

/** Creates a minimal mock Page that returns the supplied HTML from content(). */
function createMockPage(html: string): Page {
  return {
    goto:    jest.fn().mockResolvedValue(null),
    content: jest.fn().mockResolvedValue(html),
  } as unknown as Page;
}

// ─── Test Group 1: Intent Parsing ─────────────────────────────────────────────

describe('Test Group 1: Intent Parsing', () => {
  it('parses SEARCH_PRODUCT intent with price and rating filters', () => {
    const intent = parseIntent('Suggest phones under 30000 with rating above 4');
    expect(intent.type).toBe('SEARCH_PRODUCT');
    expect(intent.filters.priceMax).toBe(30000);
    expect(intent.filters.ratingMin).toBe(4);
  });

  it('defaults to amazon + flipkart when no site is mentioned', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    expect(intent.sites).toEqual(['amazon', 'flipkart']);
  });

  it('parses LOGIN intent', () => {
    const intent = parseIntent('login to my account');
    expect(intent.type).toBe('LOGIN');
  });

  it('parses NAVIGATE intent', () => {
    const intent = parseIntent('navigate to checkout');
    expect(intent.type).toBe('NAVIGATE');
  });

  it('respects explicit site mentions', () => {
    const intent = parseIntent('find phones under 20000 on amazon');
    expect(intent.sites).toEqual(['amazon']);
    expect(intent.sites).not.toContain('flipkart');
  });

  it('normalizes "smartphones" keyword to query "smartphone"', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    expect(intent.filters.query).toBe('smartphone');
  });

  it('normalizes "phones" keyword to query "smartphone"', () => {
    const intent = parseIntent('find phones under 20000');
    expect(intent.filters.query).toBe('smartphone');
  });

  // ── New intent type tests ──────────────────────────────────────────────────

  it('parses FORM_FILL intent from "fill leave form"', () => {
    expect(parseIntent('Fill leave form for tomorrow and submit').type).toBe('FORM_FILL');
  });

  it('parses FORM_FILL intent from "submit form"', () => {
    expect(parseIntent('submit the form').type).toBe('FORM_FILL');
  });

  it('parses TABLE_LOOKUP intent from "find employee"', () => {
    expect(parseIntent('Find employee John and open details').type).toBe('TABLE_LOOKUP');
  });

  it('parses TABLE_LOOKUP intent from "look up"', () => {
    expect(parseIntent('look up user record').type).toBe('TABLE_LOOKUP');
  });

  // ── Price variation tests ──────────────────────────────────────────────────

  it('parses priceMax from "below 30000"', () => {
    expect(parseIntent('find phones below 30000').filters.priceMax).toBe(30000);
  });

  it('parses priceMax from "budget 30000"', () => {
    expect(parseIntent('find phones budget 30000').filters.priceMax).toBe(30000);
  });

  it('parses priceMax from "less than 30000"', () => {
    expect(parseIntent('phones less than 30000').filters.priceMax).toBe(30000);
  });

  // ── Rating variation tests ─────────────────────────────────────────────────

  it('parses ratingMin from "4+ rating"', () => {
    expect(parseIntent('smartphones 4+ rating').filters.ratingMin).toBe(4);
  });

  it('parses ratingMin from "rating greater than 4"', () => {
    expect(parseIntent('phones with rating greater than 4').filters.ratingMin).toBe(4);
  });

  it('parses ratingMin from "4.5+ rating"', () => {
    expect(parseIntent('phones 4.5+ rating').filters.ratingMin).toBe(4.5);
  });
});

// ─── Test Group 2: Task Graph ─────────────────────────────────────────────────

describe('Test Group 2: Task Graph', () => {
  it('creates one task per site for SEARCH_PRODUCT', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    const tasks  = planTasks(intent);
    expect(tasks).toHaveLength(2);
  });

  it('creates amazon_task and flipkart_task', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    const ids    = planTasks(intent).map(t => t.id);
    expect(ids).toContain('amazon_task');
    expect(ids).toContain('flipkart_task');
  });

  it('each task has site set correctly', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    const tasks  = planTasks(intent);
    expect(tasks.find(t => t.site === 'amazon')).toBeDefined();
    expect(tasks.find(t => t.site === 'flipkart')).toBeDefined();
  });

  it('each task includes a navigate step with a URL', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    for (const task of planTasks(intent)) {
      const navStep = task.steps.find(s => s.action === 'navigate');
      expect(navStep?.url).toBeTruthy();
    }
  });

  it('each task includes an extract step', () => {
    const intent = parseIntent('Suggest smartphones under 30000 with rating above 4');
    for (const task of planTasks(intent)) {
      expect(task.steps.some(s => s.action === 'extract')).toBe(true);
    }
  });

  it('amazon task URL points to amazon domain', () => {
    const intent    = parseIntent('Suggest smartphones under 30000 with rating above 4');
    const amazonTask = planTasks(intent).find(t => t.site === 'amazon')!;
    const navStep    = amazonTask.steps.find(s => s.action === 'navigate')!;
    expect(navStep.url).toContain('amazon');
  });

  it('generates a single task for LOGIN intent', () => {
    const tasks = planTasks(parseIntent('login to my account'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toContain('login');
  });

  it('generates a single task for FORM_FILL intent', () => {
    const tasks = planTasks(parseIntent('fill leave form and submit'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toContain('form');
  });

  it('generates a single task for TABLE_LOOKUP intent', () => {
    const tasks = planTasks(parseIntent('find employee John'));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toContain('table');
  });
});

// ─── Test Group 3: Execution ──────────────────────────────────────────────────

describe('Test Group 3: Execution', () => {
  it('executes tasks sequentially and returns product arrays', async () => {
    const intent  = parseIntent('Suggest smartphones under 30000 with rating above 4');
    const tasks   = planTasks(intent);
    const mockPage = createMockPage(MOCK_HTML);

    const results: Product[][] = [];
    for (const task of tasks) {
      results.push(await executeTask(task, mockPage));
    }

    expect(results).toHaveLength(2);
    results.forEach(r => expect(Array.isArray(r)).toBe(true));
  });

  it('calls goto before extracting (navigate step runs first)', async () => {
    const intent  = parseIntent('Suggest phones under 30000 with rating above 4');
    const tasks   = planTasks(intent);
    const mockPage = createMockPage(MOCK_HTML);
    const gotoMock = mockPage.goto as jest.Mock;

    await executeTask(tasks[0], mockPage);

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock.mock.calls[0][0]).toContain('amazon');
  });

  it('returns non-empty product list when mock HTML has products', async () => {
    const intent   = parseIntent('Suggest phones under 30000 with rating above 4');
    const tasks    = planTasks(intent);
    const mockPage = createMockPage(MOCK_HTML);
    const products = await executeTask(tasks[0], mockPage);
    expect(products.length).toBeGreaterThan(0);
  });

  it('returns empty array for a task with no steps', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const products = await executeTask({ id: 'empty_task', steps: [] }, mockPage);
    expect(products).toEqual([]);
  });
});

// ─── Test Group 4: Extraction ─────────────────────────────────────────────────

describe('Test Group 4: Extraction', () => {
  it('extracts all four products from mock HTML', () => {
    const products = extractProductsFromHTML(MOCK_HTML, 'amazon');
    expect(products).toHaveLength(4);
  });

  it('extracts correct title, price and rating', () => {
    const products = extractProductsFromHTML(MOCK_HTML, 'amazon');
    const s23 = products.find(p => p.title === 'Samsung Galaxy S23');
    expect(s23).toBeDefined();
    expect(s23?.price).toBe(28000);
    expect(s23?.rating).toBe(4.5);
  });

  it('attaches the site name to every extracted product', () => {
    const products = extractProductsFromHTML(MOCK_HTML, 'flipkart');
    products.forEach(p => expect(p.site).toBe('flipkart'));
  });

  it('returns empty array for HTML with no product-item articles', () => {
    const products = extractProductsFromHTML('<html><body><p>Nothing here</p></body></html>', 'amazon');
    expect(products).toEqual([]);
  });

  it('is callable multiple times without state leakage', () => {
    const first  = extractProductsFromHTML(MOCK_HTML, 'amazon');
    const second = extractProductsFromHTML(MOCK_HTML, 'amazon');
    expect(first).toEqual(second);
  });
});

// ─── Test Group 5: Filtering ──────────────────────────────────────────────────

describe('Test Group 5: Filtering', () => {
  const products: Product[] = [
    { title: 'A', price: 28000, rating: 4.5 },
    { title: 'B', price: 32000, rating: 4.6 }, // fails priceMax
    { title: 'C', price: 25000, rating: 4.3 },
    { title: 'D', price: 18000, rating: 3.8 }, // fails ratingMin
  ];

  it('filters out products at or above priceMax', () => {
    const result = filterProducts(products, { priceMax: 30000 });
    expect(result.find(p => p.title === 'B')).toBeUndefined();
    // price === priceMax is also excluded (strict less-than)
    const atBoundary: Product[] = [{ title: 'E', price: 30000, rating: 4.5 }];
    expect(filterProducts(atBoundary, { priceMax: 30000 })).toHaveLength(0);
  });

  it('filters out products at or below ratingMin', () => {
    const result = filterProducts(products, { ratingMin: 4 });
    expect(result.find(p => p.title === 'D')).toBeUndefined();
    // rating === ratingMin is also excluded (strict greater-than)
    const atBoundary: Product[] = [{ title: 'F', price: 20000, rating: 4 }];
    expect(filterProducts(atBoundary, { ratingMin: 4 })).toHaveLength(0);
  });

  it('applies both filters simultaneously and returns only passing products', () => {
    const result = filterProducts(products, { priceMax: 30000, ratingMin: 4 });
    expect(result).toHaveLength(2);
    result.forEach(p => {
      expect(p.price).toBeLessThan(30000);
      expect(p.rating).toBeGreaterThan(4);
    });
  });

  it('returns all products when no filters are applied', () => {
    expect(filterProducts(products, {})).toHaveLength(products.length);
  });
});

// ─── Test Group 6: Aggregation ────────────────────────────────────────────────

describe('Test Group 6: Aggregation', () => {
  const products: Product[] = [
    { title: 'A', price: 28000, rating: 4.5 },
    { title: 'B', price: 25000, rating: 4.3 },
    { title: 'C', price: 22000, rating: 4.2 },
    { title: 'D', price: 15000, rating: 4.1 },
  ];

  it('returns at most 2 products', () => {
    expect(aggregateProducts(products).length).toBeLessThanOrEqual(2);
  });

  it('returns the product with the highest rating first', () => {
    const [first, second] = aggregateProducts(products);
    expect(first.rating).toBeGreaterThanOrEqual(second?.rating ?? 0);
  });

  it('top product is the one with highest rating', () => {
    const result = aggregateProducts(products);
    expect(result[0].title).toBe('A');
  });

  it('breaks rating ties by price ascending (cheaper wins)', () => {
    const tied: Product[] = [
      { title: 'X', price: 30000, rating: 4.5 },
      { title: 'Y', price: 20000, rating: 4.5 },
    ];
    const result = aggregateProducts(tied);
    expect(result[0].price).toBe(20000);
    expect(result[0].title).toBe('Y');
  });

  it('handles fewer than 2 products gracefully', () => {
    expect(aggregateProducts([])).toEqual([]);
    expect(aggregateProducts([products[0]])).toHaveLength(1);
  });

  it('does not mutate the original array', () => {
    const copy = [...products];
    aggregateProducts(products);
    expect(products).toEqual(copy);
  });
});

// ─── Test Group 7: Failure Handling ──────────────────────────────────────────

describe('Test Group 7: Failure Handling', () => {
  it('continues when the first task throws — second task still succeeds', async () => {
    let callCount = 0;
    const partiallyFailingPage = {
      goto: jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Simulated network error');
        // second call succeeds normally
      }),
      content: jest.fn().mockResolvedValue(MOCK_HTML),
    } as unknown as Page;

    const result = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => partiallyFailingPage,
    );

    // System must not throw
    expect(result).toBeDefined();
    expect(result.products).toBeDefined();
    // Second task succeeded → at least one product should pass filters
    expect(result.products.length).toBeGreaterThan(0);
  });

  it('returns empty products when ALL tasks fail', async () => {
    const fullyFailingPage = {
      goto:    jest.fn().mockRejectedValue(new Error('Network error')),
      content: jest.fn().mockResolvedValue(''),
    } as unknown as Page;

    const result = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => fullyFailingPage,
    );

    expect(result).toBeDefined();
    expect(result.products).toEqual([]);
    expect(result.topProducts).toEqual([]);
  });

  it('does not throw even when all tasks fail', async () => {
    const failingPage = {
      goto:    jest.fn().mockRejectedValue(new Error('Timeout')),
      content: jest.fn().mockResolvedValue(''),
    } as unknown as Page;

    await expect(
      runGoal('Suggest smartphones under 30000', async () => failingPage)
    ).resolves.toBeDefined();
  });
});

// ─── Test Group 8: End-to-End ─────────────────────────────────────────────────

describe('Test Group 8: End-to-End', () => {
  it('runGoal returns a structured GoalResult', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const result   = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );

    expect(result.intent.type).toBe('SEARCH_PRODUCT');
    expect(result.intent.filters.priceMax).toBe(30000);
    expect(result.intent.filters.ratingMin).toBe(4);
    expect(Array.isArray(result.products)).toBe(true);
    expect(Array.isArray(result.topProducts)).toBe(true);
  });

  it('products and topProducts reference the same results', async () => {
    const mockPage   = createMockPage(MOCK_HTML);
    const { products, topProducts } = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );
    expect(products).toEqual(topProducts);
  });

  it('all returned products pass the price and rating filters', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const { products } = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );

    expect(products.length).toBeGreaterThan(0);
    products.forEach(p => {
      expect(p.price).toBeLessThan(30000);
      expect(p.rating).toBeGreaterThan(4);
    });
  });

  it('returns at most 2 products after aggregation', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const { products } = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );
    expect(products.length).toBeLessThanOrEqual(2);
  });

  it('executes tasks for both amazon and flipkart (multi-site)', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const gotoMock = mockPage.goto as jest.Mock;

    await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );

    // Two tasks → two navigate calls
    expect(gotoMock).toHaveBeenCalledTimes(2);
    const urls = gotoMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.some(u => u.includes('amazon'))).toBe(true);
    expect(urls.some(u => u.includes('flipkart'))).toBe(true);
  });

  it('top product has the highest rating among qualifying products', async () => {
    const mockPage   = createMockPage(MOCK_HTML);
    const { products } = await runGoal(
      'Suggest smartphones under 30000 with rating above 4',
      async () => mockPage,
    );

    if (products.length >= 2) {
      expect(products[0].rating).toBeGreaterThanOrEqual(products[1].rating);
    }
  });

  it('handles "below 30000" price variation end-to-end', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const { intent, products } = await runGoal(
      'Suggest smartphones below 30000 with rating above 4',
      async () => mockPage,
    );
    expect(intent.filters.priceMax).toBe(30000);
    expect(products.length).toBeGreaterThan(0);
  });

  it('handles "4+ rating" variation end-to-end', async () => {
    const mockPage = createMockPage(MOCK_HTML);
    const { intent, products } = await runGoal(
      'Suggest smartphones below 30000 with 4+ rating',
      async () => mockPage,
    );
    expect(intent.filters.ratingMin).toBe(4);
    expect(products.length).toBeGreaterThan(0);
  });
});
