/**
 * AI Goal Processor
 *
 * Converts a natural-language goal into a structured extension action by
 * calling the OpenAI Chat Completions API.
 *
 * The API key MUST be supplied via the OPENAI_API_KEY environment variable.
 * It is NEVER hardcoded here.  Tests that depend on this module skip
 * automatically when the env var is absent.
 *
 * Uses Node.js built-in `https` — no additional npm packages needed.
 */

import * as https from 'https';
import type { ExtensionActionPayload } from '../../../extension/types';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GoalResult {
  /** Short explanation of why this action was chosen */
  reasoning: string;
  /** The structured extension action to execute */
  action: ExtensionActionPayload;
}

/**
 * Processes a natural-language `goal` against the provided `pageContext`
 * (e.g., the current page's HTML or visible text) and returns a structured
 * action the extension can execute.
 *
 * @throws If OPENAI_API_KEY is not set, or if the network/API call fails.
 */
export async function processGoalWithAI(
  goal: string,
  pageContext: string,
): Promise<GoalResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
      'Set it before running AI-powered tests.',
    );
  }

  const systemPrompt = [
    'You are an extension action planner.',
    'Given a natural-language goal and page HTML context, return a JSON object',
    'with exactly two fields:',
    '  "reasoning": a one-sentence explanation of your choice,',
    '  "action": { "action": "click"|"type"|"navigate"|"screenshot",',
    '              "target": "<css-selector-or-url>",',
    '              "value"?: "<text-to-type>" }',
    'Prefer specific, stable CSS selectors (id > attribute > tag).',
    'Output ONLY the JSON object — no markdown, no commentary.',
  ].join(' ');

  const requestBody = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Goal: ${goal}\n\nPage context (truncated to 2000 chars):\n${pageContext.slice(0, 2_000)}`,
      },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const rawResponse = await postJson('api.openai.com', '/v1/chat/completions', requestBody, apiKey);

  const content: string = rawResponse?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error(`OpenAI returned no content. Full response: ${JSON.stringify(rawResponse)}`);
  }

  let parsed: GoalResult;
  try {
    parsed = JSON.parse(content) as GoalResult;
  } catch {
    throw new Error(`OpenAI response is not valid JSON: ${content}`);
  }

  if (!parsed.action?.action || !parsed.action?.target) {
    throw new Error(`OpenAI response missing required action fields: ${content}`);
  }

  return parsed;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

function postJson(
  hostname: string,
  path: string,
  body: string,
  bearerToken: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${bearerToken}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as Record<string, unknown>);
          } catch {
            reject(new Error(`Non-JSON response from ${hostname}: ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
