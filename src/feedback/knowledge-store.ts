import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeEntry, FixSuggestion } from './types';

interface RawEntry {
  pattern: string;
  fix: string | FixSuggestion;
  context?: string;
  confidence: number;
  source: 'local' | 'user' | 'inferred';
  lastUpdated: string;
}

function normalizeEntry(raw: RawEntry): KnowledgeEntry {
  const fix: FixSuggestion =
    typeof raw.fix === 'string'
      ? { type: 'css', value: raw.fix }
      : raw.fix;
  return {
    pattern: raw.pattern,
    fix,
    context: raw.context ?? '',
    confidence: raw.confidence,
    source: raw.source,
    lastUpdated: raw.lastUpdated,
  };
}

export class KnowledgeStore {
  readonly persistPath: string;
  private entries: KnowledgeEntry[] = [];

  constructor(persistPath = 'feedback/knowledge-base.json') {
    this.persistPath = persistPath;
    this.loadFromDisk();
  }

  match(goal: string, step: string): KnowledgeEntry | null {
    const needle = `${goal} ${step}`.toLowerCase();
    let best: KnowledgeEntry | null = null;
    let bestConf = 0;
    for (const entry of this.entries) {
      if (needle.includes(entry.pattern.toLowerCase())) {
        if (entry.confidence > bestConf) {
          bestConf = entry.confidence;
          best = entry;
        }
      }
    }
    return best;
  }

  add(entry: KnowledgeEntry): void {
    const idx = this.entries.findIndex((e) => e.pattern === entry.pattern);
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
    this.saveToDisk();
  }

  getAll(): KnowledgeEntry[] {
    return [...this.entries];
  }

  private loadFromDisk(): void {
    if (!fs.existsSync(this.persistPath)) return;
    try {
      const content = fs.readFileSync(this.persistPath, 'utf8');
      const raw = JSON.parse(content) as RawEntry[];
      this.entries = raw.map(normalizeEntry);
    } catch {
      this.entries = [];
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch {
      /* ignore write errors */
    }
  }
}
