import type { ElementHandle, Page } from 'puppeteer-core';
import { SelectorCandidate, StepRecord } from './types';

export async function captureStepMetadata(
  page: Page,
  element: ElementHandle | null,
  action: string,
  target: string,
): Promise<StepRecord> {
  const url = page.url();
  const timestamp = Date.now();

  if (!element) {
    return { action, target, url, timestamp };
  }

  const meta = await element
    .evaluate((el) => {
      const e = el as HTMLElement;
      const tag = e.tagName.toUpperCase();
      const role =
        e.getAttribute('role') ||
        (tag === 'BUTTON' ? 'button' : '') ||
        (tag === 'A' ? 'link' : '') ||
        (tag === 'INPUT' ? (e as HTMLInputElement).type || 'textbox' : '') ||
        '';

      const pathParts: string[] = [];
      let cur: Element | null = e;
      for (let i = 0; i < 5 && cur && cur !== document.body; i++) {
        const t = cur.tagName.toLowerCase();
        const id = cur.id ? `#${cur.id}` : '';
        const tid = cur.getAttribute('data-testid')
          ? `[data-testid="${cur.getAttribute('data-testid')}"]`
          : '';
        pathParts.unshift(`${t}${id}${tid}`);
        cur = cur.parentElement;
      }

      return {
        text: e.textContent?.trim().slice(0, 100) ?? '',
        role,
        ariaLabel: e.getAttribute('aria-label') ?? undefined,
        dataTestId: e.getAttribute('data-testid') ?? undefined,
        domPath: pathParts.join(' > '),
      };
    })
    .catch(() => ({
      text: '',
      role: '',
      ariaLabel: undefined as string | undefined,
      dataTestId: undefined as string | undefined,
      domPath: '',
    }));

  const selectors = buildSelectorCandidates(meta);

  return {
    action,
    target,
    text: meta.text || undefined,
    role: meta.role || undefined,
    ariaLabel: meta.ariaLabel,
    dataTestId: meta.dataTestId,
    domPath: meta.domPath || undefined,
    url,
    timestamp,
    selectors,
  };
}

function buildSelectorCandidates(meta: {
  text?: string;
  role?: string;
  ariaLabel?: string | undefined;
  dataTestId?: string | undefined;
  domPath?: string;
}): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  if (meta.dataTestId) {
    candidates.push({
      type: 'data-testid',
      value: `[data-testid="${meta.dataTestId}"]`,
      rank: 1,
    });
  }
  if (meta.ariaLabel) {
    const escaped = meta.ariaLabel.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    candidates.push({ type: 'aria-label', value: `[aria-label="${escaped}"]`, rank: 2 });
  }
  if (meta.role && meta.text) {
    const safeRole = meta.role.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeText = meta.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    candidates.push({
      type: 'role-text',
      value: `::-p-xpath(//*[@role="${safeRole}" and normalize-space(.)="${safeText}"])`,
      rank: 3,
    });
  }
  if (meta.text) {
    candidates.push({ type: 'text', value: `text=${meta.text}`, rank: 4 });
  }
  if (meta.domPath) {
    candidates.push({ type: 'css', value: meta.domPath, rank: 5 });
  }

  return candidates.sort((a, b) => a.rank - b.rank);
}

export class ActionRecorder {
  private records: StepRecord[] = [];

  record(step: StepRecord): void {
    this.records.push(step);
  }

  getRecords(): StepRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
  }
}
