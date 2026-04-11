export interface FailureRecord {
  goal: string;
  step: string;
  error: string;
  selector: string;
  url: string;
  timestamp: number;
}

export interface FixSuggestion {
  type: 'text' | 'role' | 'css' | 'skip';
  value: string;
}

export interface KnowledgeEntry {
  pattern: string;
  fix: FixSuggestion;
  context: string;
  confidence: number;
  source: 'local' | 'user' | 'inferred';
  lastUpdated: string;
}
