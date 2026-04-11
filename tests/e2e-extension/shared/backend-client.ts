/**
 * Backend API client for extension integration tests.
 *
 * All LLM logic lives in the Python FastAPI backend (backend/main.py).
 * Tests never call OpenAI directly — they call the backend, which reads
 * OPENAI_API_KEY from its own server-side environment.
 *
 * The backend subprocess inherits the test runner's environment, so:
 *   export OPENAI_API_KEY=sk-...   # set once in shell / CI secret
 *   pnpm test:e2e-extension        # backend process picks it up automatically
 */

import * as http from 'http';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

export const BACKEND_PORT = 8000;

// ─── Types mirroring backend/models.py ────────────────────────────────────────

export interface BackendLogEntry {
  level:     'debug' | 'info' | 'warn' | 'error';
  source:    'background' | 'content-script' | 'popup';
  message:   string;
  timestamp: number;
  data:      Record<string, unknown>;
}

export interface ExtensionActionStep {
  action:    'click' | 'type' | 'navigate' | 'screenshot';
  target:    string;
  value?:    string | null;
  reasoning: string;
}

export interface PlanWithContextResponse {
  steps:     ExtensionActionStep[];
  reasoning: string;
}

// ─── Process management ───────────────────────────────────────────────────────

/**
 * Starts the FastAPI backend with uvicorn and waits for it to be healthy.
 * If the backend is already running on the given port, returns null (no-op).
 * The process inherits the caller's environment (including OPENAI_API_KEY).
 */
export async function startBackend(port = BACKEND_PORT, timeoutMs = 25_000): Promise<ChildProcess | null> {
  // If already running, skip — avoids "address already in use" errors
  const alreadyUp = await waitForBackendHealth(port, 1_500).then(() => true).catch(() => false);
  if (alreadyUp) {
    console.log(`[backend-client] Backend already running on port ${port}`);
    return null;
  }

  const root = path.resolve(__dirname, '../../..');

  const proc = spawn(
    'python3',
    ['-m', 'uvicorn', 'backend.main:app', '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: root,
      env: { ...process.env }, // inherits OPENAI_API_KEY from test runner's env
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  // Surface any startup errors to the console for debugging
  proc.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) process.stderr.write(`[backend] ${line}\n`);
  });

  await waitForBackendHealth(port, timeoutMs);
  return proc;
}

/** Wait until GET /health returns 200 or timeout. */
async function waitForBackendHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 500));
    try {
      const ok = await httpGet<{ status: string }>(port, '/health');
      if (ok?.status === 'ok') return;
    } catch {
      /* not ready yet */
    }
  }
  throw new Error(`Backend on port ${port} did not start within ${timeoutMs}ms`);
}

// ─── Log management ───────────────────────────────────────────────────────────

/** Fetch all captured log entries from the backend in-memory store. */
export function getBackendLogs(port = BACKEND_PORT): Promise<BackendLogEntry[]> {
  return httpGet<BackendLogEntry[]>(port, '/logs').then((r) => r ?? []);
}

/** Clear the backend's in-memory log store (call in beforeAll for a clean slate). */
export async function clearBackendLogs(port = BACKEND_PORT): Promise<void> {
  await httpDelete(port, '/logs');
}

// ─── Planning ─────────────────────────────────────────────────────────────────

/**
 * Ask the backend to translate a natural-language goal + page HTML into
 * concrete extension action steps (CSS selectors + action types).
 *
 * With OPENAI_API_KEY set → uses gpt-4o-mini for real planning.
 * Without it → returns a heuristic mock plan.
 */
export function planWithContext(
  goal:     string,
  pageHtml: string,
  port = BACKEND_PORT,
): Promise<PlanWithContextResponse> {
  return httpPost<PlanWithContextResponse>(port, '/plan-with-context', { goal, pageHtml });
}

// ─── Low-level HTTP helpers ───────────────────────────────────────────────────

function httpGet<T>(port: number, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => { body += c.toString(); });
        res.on('end', () => {
          try { resolve(JSON.parse(body) as T); }
          catch { reject(new Error(`Non-JSON from GET ${path}: ${body.slice(0, 200)}`)); }
        });
      },
    );
    req.setTimeout(5_000, () => { req.destroy(); reject(new Error(`Timeout GET ${path}`)); });
    req.on('error', reject);
    req.end();
  });
}

function httpPost<T>(port: number, path: string, body: unknown): Promise<T> {
  const raw = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => {
          try { resolve(JSON.parse(data) as T); }
          catch { reject(new Error(`Non-JSON from POST ${path}: ${data.slice(0, 200)}`)); }
        });
      },
    );
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error(`Timeout POST ${path}`)); });
    req.on('error', reject);
    req.end(raw);
  });
}

function httpDelete(port: number, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'DELETE' },
      (res) => { res.resume(); res.on('end', resolve); },
    );
    req.setTimeout(5_000, () => { req.destroy(); reject(new Error(`Timeout DELETE ${path}`)); });
    req.on('error', reject);
    req.end();
  });
}
