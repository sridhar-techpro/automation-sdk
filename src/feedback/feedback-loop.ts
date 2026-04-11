import * as readline from 'readline';
import { FailureRecord, FixSuggestion, KnowledgeEntry } from './types';
import { FailureStore } from './failure-store';
import { KnowledgeStore } from './knowledge-store';

export class FeedbackLoop {
  constructor(
    private failureStore: FailureStore,
    private knowledgeStore: KnowledgeStore,
  ) {}

  captureFailure(failure: FailureRecord): void {
    this.failureStore.record(failure);
  }

  async promptFix(failure: FailureRecord): Promise<FixSuggestion | null> {
    if (!process.stdin.isTTY || process.env.CI || process.env.JEST_WORKER_ID) return null;

    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      console.log(`\nStep failed: ${failure.step}`);
      console.log('Choose fix:');
      console.log('1. text selector');
      console.log('2. role selector');
      console.log('3. css selector');
      console.log('4. skip');

      rl.question('Enter choice (1-4): ', (answer) => {
        rl.close();
        const types: Array<FixSuggestion['type']> = ['text', 'role', 'css', 'skip'];
        const idx = parseInt(answer.trim(), 10) - 1;
        if (idx < 0 || idx > 3) {
          resolve(null);
          return;
        }
        if (types[idx] === 'skip') {
          resolve({ type: 'skip', value: '' });
          return;
        }
        const type = types[idx];
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl2.question(`Enter ${type} value: `, (value) => {
          rl2.close();
          resolve({ type, value: value.trim() });
        });
      });
    });
  }

  learnFromFix(failure: FailureRecord, fix: FixSuggestion, value: string): void {
    const entry: KnowledgeEntry = {
      pattern: `${failure.goal} ${failure.step}`,
      fix: { ...fix, value },
      context: failure.url,
      confidence: 0.7,
      source: 'user',
      lastUpdated: new Date().toISOString(),
    };
    this.knowledgeStore.add(entry);
  }

  applyKnowledge(goal: string, step: string): KnowledgeEntry | null {
    return this.knowledgeStore.match(goal, step);
  }
}
