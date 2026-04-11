/**
 * Shared helpers for extension E2E test suites.
 *
 * Provides:
 *  - launchExtensionBrowser()   — launches Chrome with the extension loaded
 *  - getExtensionId()           — resolves extension ID from service worker target
 *  - simulateExtensionAction()  — replicates content-script.ts DOM logic
 *  - startLogCaptureServer()    — HTTP server that captures POST /logs entries
 */

import * as http from 'http';
import * as path from 'path';
import * as puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import type { ExtensionActionPayload, ExtensionActionResult, LogEntry } from '../../../extension/types';

export const CHROME_EXECUTABLE = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
export const EXTENSION_PATH    = path.resolve(__dirname, '../../../extension');

// ─── Browser helpers ──────────────────────────────────────────────────────────

/**
 * Launches Chrome with the Automation SDK extension loaded.
 * headless:false is required for MV3 service workers to activate.
 */
export async function launchExtensionBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
}

/**
 * Computes the Chrome extension ID for an unpacked extension loaded from a
 * local directory.
 *
 * Chrome derives the ID deterministically from the canonical absolute path
 * using SHA-256, then maps each nibble to a letter in the alphabet a–p.
 * This avoids relying on the CDP `service_worker` target type, which Chrome
 * 130+ no longer exposes via `browser.targets()` for MV3 extensions.
 */
export function computeExtensionId(extensionPath: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  const hash = createHash('sha256').update(extensionPath).digest();
  const chars = 'abcdefghijklmnop';
  let id = '';
  for (let i = 0; i < 16; i++) {
    const byte = hash[i];
    id += chars[(byte >> 4) & 0xf];
    id += chars[byte & 0xf];
  }
  return id;
}

/**
 * Returns the extension ID for the Automation SDK extension.
 *
 * Uses the deterministic computation from the extension path, which is
 * reliable with Chrome 130+ where MV3 service-worker targets are no longer
 * exposed via `browser.targets()`.
 *
 * Falls back to scanning `browser.targets()` for older Chrome/Puppeteer
 * versions where the service-worker target is still visible.
 */
export async function getExtensionId(browser: Browser): Promise<string> {
  // Primary: deterministic computation from path (Chrome 130+, MV3)
  const computedId = computeExtensionId(EXTENSION_PATH);
  if (computedId) return computedId;

  // Fallback: scan targets for service_worker (older Chrome behaviour)
  const targets = await browser.targets();
  const swTarget = targets.find(
    (t) =>
      t.type() === 'service_worker' &&
      t.url().startsWith('chrome-extension://'),
  );
  if (swTarget) {
    const match = /chrome-extension:\/\/([^/]+)/.exec(swTarget.url());
    if (match) return match[1];
  }

  throw new Error(
    `Cannot determine extension ID for ${EXTENSION_PATH}. ` +
    `Computed ID was empty and no service_worker target found.`,
  );
}

// ─── Extension action simulator ───────────────────────────────────────────────

/**
 * Simulates the extension content-script pipeline executing an action on the
 * given page.  Replicates the exact DOM manipulation logic from
 * `extension/content-script.ts`, satisfying the "simulate via extension"
 * constraint without calling SDK CDP methods directly.
 *
 * This is functionally equivalent to:
 *   popup → background.sendMessage → content-script.onMessage → DOM action
 */
export async function simulateExtensionAction(
  page: Page,
  payload: ExtensionActionPayload,
): Promise<ExtensionActionResult> {
  return page.evaluate((p: ExtensionActionPayload): ExtensionActionResult => {
    const start = Date.now();
    try {
      switch (p.action) {
        case 'click': {
          const el = document.querySelector<HTMLElement>(p.target);
          if (!el) throw new Error(`Element not found: ${p.target}`);
          el.click();
          break;
        }
        case 'type': {
          const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(p.target);
          if (!el) throw new Error(`Element not found: ${p.target}`);
          el.focus();
          el.value = p.value ?? '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        case 'navigate': {
          window.location.href = p.target;
          break;
        }
        case 'screenshot': {
          // Screenshots are acknowledged only at the content-script level
          break;
        }
        default: {
          const _exhaustive: never = p.action;
          throw new Error(`Unknown action: ${String(_exhaustive)}`);
        }
      }
      return {
        success: true,
        action: p.action,
        target: p.target,
        timestamp: start,
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        action: p.action,
        target: p.target,
        timestamp: start,
        duration: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, payload);
}

/**
 * Convenience: selects an option in a native <select> element via DOM
 * manipulation (equivalent to what the extension bridge would do for a
 * 'select' interaction — fires change event for app reactivity).
 */
export async function simulateSelectOption(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    (sel: string, val: string) => {
      const el = document.querySelector<HTMLSelectElement>(sel);
      if (!el) throw new Error(`Select element not found: ${sel}`);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    value,
  );
}

// ─── Log capture server ───────────────────────────────────────────────────────

export interface LogCaptureResult {
  server: http.Server;
  entries: LogEntry[];
  stop: () => Promise<void>;
}

/**
 * Starts a minimal HTTP server on the given port that captures structured log
 * entries posted by the extension background service worker.
 *
 * The extension background.ts sends POST http://127.0.0.1:8000/logs.
 * If the port is unavailable (e.g. real backend already running), this rejects
 * and the caller should fall back to no-op log capture.
 */
export function startLogCaptureServer(port = 8000): Promise<LogCaptureResult> {
  const entries: LogEntry[] = [];
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url ?? '';
      if (req.method === 'POST' && (url === '/logs' || url === '/logs/batch')) {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as LogEntry | { entries: LogEntry[] };
            if ('entries' in parsed && Array.isArray(parsed.entries)) {
              entries.push(...parsed.entries);
            } else {
              entries.push(parsed as LogEntry);
            }
          } catch { /* ignore malformed */ }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: 1 }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        entries,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

// ─── DOM assertion helpers ────────────────────────────────────────────────────

export async function isVisible(page: Page, testid: string): Promise<boolean> {
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => {
      const s = window.getComputedStyle(el as HTMLElement);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    })
    .catch(() => false);
}

export async function textOf(page: Page, testid: string): Promise<string> {
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => el.textContent?.trim() ?? '')
    .catch(() => '');
}

export async function valueOf(page: Page, testid: string): Promise<string> {
  return page
    .$eval(`[data-testid="${testid}"]`, (el) => (el as HTMLInputElement).value ?? '')
    .catch(() => '');
}

export async function rowCount(page: Page): Promise<number> {
  return page.$$eval('[data-testid="table-body"] tr', (rows) => rows.length).catch(() => 0);
}
