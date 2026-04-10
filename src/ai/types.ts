export type IntentType = 'SEARCH_PRODUCT' | 'LOGIN' | 'NAVIGATE';

export interface Filters {
  priceMax?: number;
  ratingMin?: number;
  query?: string;
}

export interface Intent {
  type: IntentType;
  filters: Filters;
  sites: string[];
}

export type StepAction = 'navigate' | 'extract';

export interface ExecutionStep {
  action: StepAction;
  url?: string;
}

export interface Task {
  id: string;
  site: string;
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
  products: Product[];
}
