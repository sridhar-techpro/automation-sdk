import { parseSelector } from '../../src/selectors/selector-engine';
import { withRetry } from '../../src/reliability/retry';

describe('parseSelector', () => {
  it('parses text= as text-exact', () => {
    const result = parseSelector('text=Login');
    expect(result).toEqual({ type: 'text-exact', value: 'Login' });
  });

  it('parses text*= as text-partial', () => {
    const result = parseSelector('text*=Log');
    expect(result).toEqual({ type: 'text-partial', value: 'Log' });
  });

  it('parses #id as css', () => {
    const result = parseSelector('#btn');
    expect(result).toEqual({ type: 'css', value: '#btn' });
  });

  it('parses .class as css', () => {
    const result = parseSelector('.class');
    expect(result).toEqual({ type: 'css', value: '.class' });
  });

  it('parses complex CSS selector', () => {
    const result = parseSelector('div.container > p:first-child');
    expect(result).toEqual({ type: 'css', value: 'div.container > p:first-child' });
  });
});

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { retries: 3, delay: 10, backoff: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'success';
    });
    const result = await withRetry(fn, { retries: 3, delay: 10, backoff: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after all retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, { retries: 2, delay: 10, backoff: 1 })).rejects.toThrow(
      'always fails'
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('applies exponential backoff', async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: any, delay?: number, ...args: any[]) => {
      if (delay !== undefined) delays.push(delay);
      return originalSetTimeout(fn, 0, ...args);
    });

    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');

    await withRetry(fn, { retries: 3, delay: 100, backoff: 2 });
    jest.restoreAllMocks();

    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(200);
  });
});
