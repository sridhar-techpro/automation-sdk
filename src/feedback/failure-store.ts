import * as fs from 'fs';
import * as path from 'path';
import { FailureRecord } from './types';

export class FailureStore {
  readonly persistPath: string;

  constructor(persistPath = 'feedback/failures.json') {
    this.persistPath = persistPath;
  }

  record(failure: FailureRecord): void {
    const all = this.getAll();
    all.push(failure);
    const dir = path.dirname(this.persistPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.persistPath, JSON.stringify(all, null, 2), 'utf8');
  }

  getAll(): FailureRecord[] {
    if (!fs.existsSync(this.persistPath)) return [];
    try {
      const content = fs.readFileSync(this.persistPath, 'utf8');
      return JSON.parse(content) as FailureRecord[];
    } catch {
      return [];
    }
  }
}
