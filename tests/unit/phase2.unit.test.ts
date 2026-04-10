import { parseSelector } from '../../src/selectors/selector-engine';
import {
  buildRoleSelector,
  buildLabelSelector,
  buildPlaceholderSelector,
  buildTestIdSelector,
  buildTextSelector,
} from '../../src/selectors/advanced-selectors';

// ─── parseSelector (Phase 2 additions) ───────────────────────────────────────

describe('parseSelector — Phase 2', () => {
  it('parses xpath= prefix as xpath', () => {
    expect(parseSelector('xpath=//button')).toEqual({ type: 'xpath', value: '//button' });
  });

  it('parses bare // as xpath', () => {
    expect(parseSelector('//div[@id="foo"]')).toEqual({
      type: 'xpath',
      value: '//div[@id="foo"]',
    });
  });

  it('parses (// as xpath (grouped XPath expression)', () => {
    expect(parseSelector('(//button)[1]')).toEqual({ type: 'xpath', value: '(//button)[1]' });
  });

  it('parses shadow= prefix as shadow', () => {
    expect(parseSelector('shadow=#host')).toEqual({ type: 'shadow', value: '#host' });
  });

  it('still parses text= correctly', () => {
    expect(parseSelector('text=Login')).toEqual({ type: 'text-exact', value: 'Login' });
  });

  it('still parses text*= correctly', () => {
    expect(parseSelector('text*=Log')).toEqual({ type: 'text-partial', value: 'Log' });
  });

  it('still parses #id as css', () => {
    expect(parseSelector('#btn')).toEqual({ type: 'css', value: '#btn' });
  });
});

// ─── Advanced selectors ───────────────────────────────────────────────────────

describe('buildPlaceholderSelector', () => {
  it('returns a CSS attribute selector', () => {
    expect(buildPlaceholderSelector('Enter email')).toBe('[placeholder="Enter email"]');
  });

  it('escapes double quotes inside the value', () => {
    expect(buildPlaceholderSelector('Say "hi"')).toBe('[placeholder="Say \\"hi\\""]');
  });
});

describe('buildTestIdSelector', () => {
  it('returns a data-testid CSS selector', () => {
    expect(buildTestIdSelector('submit-btn')).toBe('[data-testid="submit-btn"]');
  });

  it('escapes double quotes inside the id', () => {
    expect(buildTestIdSelector('a"b')).toBe('[data-testid="a\\"b"]');
  });
});

describe('buildTextSelector', () => {
  it('returns text= for exact match (default)', () => {
    expect(buildTextSelector('Login')).toBe('text=Login');
  });

  it('returns text*= for partial match', () => {
    expect(buildTextSelector('Log', false)).toBe('text*=Log');
  });
});

describe('buildLabelSelector', () => {
  it('returns a ::-p-xpath selector referencing the label for attribute', () => {
    const sel = buildLabelSelector('Email Address');
    expect(sel).toContain('::-p-xpath(');
    expect(sel).toContain('Email Address');
  });
});

describe('buildRoleSelector', () => {
  it('returns a ::-p-xpath selector for button role', () => {
    const sel = buildRoleSelector('button');
    expect(sel).toContain('::-p-xpath(');
    expect(sel).toContain('button');
  });

  it('includes name condition when name option is provided', () => {
    const sel = buildRoleSelector('button', { name: 'Submit' });
    expect(sel).toContain('Submit');
  });

  it('handles XPath escaping for name with single quote', () => {
    const sel = buildRoleSelector('button', { name: "Don't click" });
    expect(sel).toContain("Don't click");
  });
});

// ─── Locator — unit tests (no browser) ───────────────────────────────────────

import { Locator } from '../../src/locator/locator';
import { SDKConfig } from '../../src/core/types';

const mockConfig: SDKConfig = {
  defaultTimeout: 5000,
  retries: 1,
  retryDelay: 100,
};

// Minimal Page-like stub for constructor — no methods called at construction time
const fakeContext = {} as never;

describe('Locator — chainable API (no browser)', () => {
  it('creates a Locator via constructor', () => {
    const loc = new Locator(fakeContext, '#btn', mockConfig);
    expect(loc).toBeInstanceOf(Locator);
  });

  it('nth() returns a new Locator', () => {
    const loc = new Locator(fakeContext, '.item', mockConfig);
    const nth2 = loc.nth(2);
    expect(nth2).toBeInstanceOf(Locator);
    expect(nth2).not.toBe(loc);
  });

  it('first() returns a new Locator', () => {
    const loc = new Locator(fakeContext, '.item', mockConfig);
    const first = loc.first();
    expect(first).toBeInstanceOf(Locator);
    expect(first).not.toBe(loc);
  });

  it('last() returns a new Locator', () => {
    const loc = new Locator(fakeContext, '.item', mockConfig);
    const last = loc.last();
    expect(last).toBeInstanceOf(Locator);
    expect(last).not.toBe(loc);
  });

  it('filter() returns a new Locator', () => {
    const loc = new Locator(fakeContext, '.item', mockConfig);
    const filtered = loc.filter({ hasText: 'Apple' });
    expect(filtered).toBeInstanceOf(Locator);
    expect(filtered).not.toBe(loc);
  });

  it('locator() returns a child Locator', () => {
    const loc = new Locator(fakeContext, '#form', mockConfig);
    const child = loc.locator('input');
    expect(child).toBeInstanceOf(Locator);
    expect(child).not.toBe(loc);
  });

  it('chains are immutable — original is not modified', () => {
    const loc = new Locator(fakeContext, '.item', mockConfig);
    const nth1 = loc.nth(1);
    const filtered = loc.filter({ hasText: 'hello' });
    // All three should be independent objects
    expect(nth1).not.toBe(filtered);
    expect(loc).not.toBe(nth1);
  });
});
