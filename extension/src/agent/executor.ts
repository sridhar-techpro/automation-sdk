/**
 * Executor — sends each plan step to the background service worker
 * which forwards them to the content script (SDK execution).
 *
 * The extension uses SDK for ALL actions — no direct DOM manipulation.
 */

import type { PlanStep } from './planner';

export interface StepResult {
  step: PlanStep;
  success: boolean;
  error?: string;
  duration: number;
}

export async function executeStep(
  step: PlanStep,
  tabId: number,
): Promise<StepResult> {
  const start = Date.now();

  return new Promise<StepResult>((resolve) => {
    // Send directly to the content script in the target tab (not to background onMessage,
    // which a service worker cannot trigger on itself via chrome.runtime.sendMessage).
    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'EXECUTE_ACTION',
        payload: {
          action: step.action,
          target: step.target,
          value: step.value,
        },
      },
      (response: { type: string; result: { success: boolean; error?: string } } | undefined) => {
        const duration = Date.now() - start;
        if (chrome.runtime.lastError) {
          resolve({
            step, success: false,
            error: chrome.runtime.lastError.message,
            duration,
          });
          return;
        }
        resolve({
          step,
          success: response?.result?.success ?? false,
          error: response?.result?.error,
          duration,
        });
      },
    );
  });
}
