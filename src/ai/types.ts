export type IntentType = 'SEARCH_PRODUCT' | 'LOGIN' | 'FORM_FILL' | 'NAVIGATE' | 'TABLE_LOOKUP';

export interface Filters {
  priceMax?: number;
  ratingMin?: number;
  query?: string;
}

export interface Intent {
  type: IntentType;
  filters: Filters;
  sites: string[];
  /** Generic key/value parameters extracted from the input (e.g. credentials, field values). */
  params?: Record<string, string>;
}

export type StepAction = 'navigate' | 'extract';

export interface ExecutionStep {
  action: StepAction;
  url?: string;
}

export interface Task {
  id: string;
  site?: string;
  steps: ExecutionStep[];
}

export interface Product {
  title: string;
  price: number;
  rating: number;
  site?: string;
}

export interface GoalResult {
  intent: Intent;
  /** Full filtered + aggregated product list. */
  products: Product[];
  /** Alias for products — top-N results after aggregation. */
  topProducts: Product[];
}
