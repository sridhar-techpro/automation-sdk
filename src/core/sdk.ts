import type { Page, ElementHandle } from 'puppeteer-core';
import { ActionPayload, ActionResult, SDKConfig, LoadState, ScrollDiscoveryOptions, WaitForElementAfterActionOptions } from './types';
import { GoalResult } from '../ai/types';
import { runGoal } from '../ai/goal-runner';
import { ConnectionManager } from '../engine/connection-manager';
import { ActionLogger } from '../tracer/logger';
import { DomainWhitelist } from '../governance/whitelist';
import { PolicyEnforcer } from '../governance/policy';
import { executeClick, executeNavigate, executeType } from './action';
import { Locator } from '../locator/locator';
import { TabManager } from '../tabs/tab-manager';
import {
  buildRoleSelector,
  buildLabelSelector,
  buildPlaceholderSelector,
  buildTestIdSelector,
  buildTextSelector,
} from '../selectors/advanced-selectors';
import { waitForLoadState } from '../reliability/load-state';
import { findElementWithScroll } from '../reliability/scroll-discovery';
import { waitForElementAfterAction } from '../reliability/event-driven';
import { ActionRecorder } from '../recorder';
import { generateReplayScript } from '../replay/script-generator';
import { ReplayEngine } from '../replay/replay-engine';
import { WorkflowStore } from '../workflow/workflow-store';
import { SuccessRateTracker } from '../metrics/success-tracker';
import type { ReplayScript, WorkflowRecord, RunMetrics } from '../replay/types';

export class AutomationSDK {
  private config: SDKConfig;
  private connectionManager: ConnectionManager;
  private logger: ActionLogger;
  private whitelist: DomainWhitelist;
  private policyEnforcer: PolicyEnforcer;
  private recorder: ActionRecorder;
  private workflowStore: WorkflowStore;
  private replayEngine: ReplayEngine;
  private successTracker: SuccessRateTracker;

  constructor(config: SDKConfig) {
    this.config = config;
    const endpoint = config.browserWSEndpoint ?? 'ws://localhost:9222';
    this.connectionManager = new ConnectionManager(endpoint, config.connectTimeout);
    this.logger = new ActionLogger();
    this.whitelist = new DomainWhitelist();
    if (config.allowedDomains) {
      for (const domain of config.allowedDomains) {
        this.whitelist.add(domain);
      }
    }
    this.policyEnforcer = new PolicyEnforcer(this.whitelist);
    this.recorder = new ActionRecorder();
    this.workflowStore = new WorkflowStore();
    this.replayEngine = new ReplayEngine(() => this.connectionManager.getPage());
    this.successTracker = new SuccessRateTracker(this.workflowStore);
  }

  async connect(): Promise<void> {
    await this.connectionManager.connect();
  }

  async execute(payload: ActionPayload): Promise<ActionResult> {
    if (!this.connectionManager.isConnected()) {
      throw new Error('SDK is not connected. Call connect() first.');
    }

    const page = await this.connectionManager.getPage();
    let result: ActionResult;

    switch (payload.action) {
      case 'click':
        result = await executeClick(page, payload.target, this.config);
        break;
      case 'type':
        result = await executeType(page, payload.target, payload.value ?? '', this.config);
        break;
      case 'navigate':
        this.policyEnforcer.enforce(payload.target);
        result = await executeNavigate(page, payload.target, this.config);
        break;
      case 'screenshot':
        result = {
          success: true,
          action: 'screenshot',
          target: payload.target,
          timestamp: Date.now(),
          duration: 0,
        };
        break;
      default: {
        const _exhaustive: never = payload.action;
        throw new Error(`Unknown action: ${String(_exhaustive)}`);
      }
    }

    this.logger.log(result);
    return result;
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
  }

  isConnected(): boolean {
    return this.connectionManager.isConnected();
  }

  async getPage(): Promise<Page> {
    return this.connectionManager.getPage();
  }

  getLogs(): ActionResult[] {
    return this.logger.getLogs();
  }

  // ─── Locator API ──────────────────────────────────────────────────────────

  /**
   * Returns a lazy Locator for the given selector.
   * The element is only resolved when an action (click, type, …) is called.
   */
  locator(selector: string): Locator {
    return new Locator(
      async () => this.connectionManager.getPage(),
      selector,
      this.config,
    );
  }

  // ─── Frame support ────────────────────────────────────────────────────────

  /**
   * Returns an object with a `locator()` method scoped to the content of the
   * matched iframe element.  The iframe is resolved lazily at action time.
   */
  frame(frameSelector: string): { locator: (selector: string) => Locator } {
    const getPage = () => this.connectionManager.getPage();
    const config = this.config;

    return {
      locator: (selector: string): Locator => {
        const frameResolver = async () => {
          const page = await getPage();
          const timeout = config.defaultTimeout;
          await page.waitForSelector(frameSelector, { timeout });
          const el = await page.$(frameSelector);
          if (!el) throw new Error(`Frame element not found: ${frameSelector}`);
          const fr = await el.contentFrame();
          if (!fr) throw new Error(`Cannot get content frame for: ${frameSelector}`);
          return fr;
        };
        return new Locator(frameResolver, selector, config);
      },
    };
  }

  // ─── Multi-tab ────────────────────────────────────────────────────────────

  private _getTabManager(): TabManager {
    return new TabManager(this.connectionManager.getBrowser());
  }

  /**
   * Returns all currently open pages in the browser.
   */
  async getTabs(): Promise<Page[]> {
    return this._getTabManager().getTabs();
  }

  /**
   * Returns the page at the given zero-based tab index.
   */
  async switchToTab(index: number): Promise<Page> {
    return this._getTabManager().switchToTab(index);
  }

  /**
   * Executes an async action on the tab at the given index.
   */
  async executeOnTab<T>(index: number, action: (page: Page) => Promise<T>): Promise<T> {
    return this._getTabManager().executeOnTab(index, action);
  }

  // ─── AI-native goal execution ─────────────────────────────────────────────

  /**
   * Accepts a natural-language goal, converts it into a multi-site task graph,
   * executes it using the SDK's connected browser page, and returns structured
   * product results.
   *
   * Requires an active connection — call connect() first.
   */
  async executeGoal(input: string): Promise<GoalResult> {
    if (!this.connectionManager.isConnected()) {
      throw new Error('SDK is not connected. Call connect() first.');
    }
    return runGoal(input, () => this.connectionManager.getPage());
  }

  // ─── Screenshot ───────────────────────────────────────────────────────────

  /**
   * Takes a full-page screenshot and returns it as a Buffer.
   */
  async screenshot(): Promise<Buffer> {
    const page = await this.connectionManager.getPage();
    return page.screenshot() as Promise<Buffer>;
  }

  // ─── Advanced selectors ───────────────────────────────────────────────────

  getByRole(role: string, options?: { name?: string }): Locator {
    return this.locator(buildRoleSelector(role, options));
  }

  getByLabel(text: string): Locator {
    return this.locator(buildLabelSelector(text));
  }

  getByPlaceholder(text: string): Locator {
    return this.locator(buildPlaceholderSelector(text));
  }

  getByTestId(id: string): Locator {
    return this.locator(buildTestIdSelector(id));
  }

  getByText(text: string, options?: { exact?: boolean }): Locator {
    return this.locator(buildTextSelector(text, options?.exact ?? true));
  }

  // ─── Reliability Engine API ───────────────────────────────────────────────

  /**
   * Waits for the page to reach the specified load state.
   *
   * - `domcontentloaded` — DOM is parsed and deferred scripts have run.
   * - `networkidle` — no network requests in flight for ~500 ms.
   *
   * Call this after navigation to ensure the page is ready for interaction,
   * or before extraction to ensure dynamic content has settled.
   */
  async waitForLoadState(state: LoadState, timeout?: number): Promise<void> {
    const page = await this.connectionManager.getPage();
    await waitForLoadState(page, state, timeout ?? this.config.defaultTimeout);
  }

  /**
   * Searches for `selector` in the current viewport; if not found, scrolls
   * the page down incrementally and retries after each step.
   *
   * Use for elements that are lazily inserted into the DOM by scroll events,
   * or for elements positioned far below the initial viewport.
   */
  async findWithScroll(
    selector: string,
    options?: ScrollDiscoveryOptions,
  ): Promise<ElementHandle> {
    const page = await this.connectionManager.getPage();
    return findElementWithScroll(page, selector, options);
  }

  /**
   * Performs `action` and then waits for `targetSelector` to become visible.
   * The wait is started *before* the action to avoid missing fast UI updates.
   *
   * Use for: dropdown opens after click, form field appears after change,
   * modal opens after click.
   */
  async waitForElementAfterAction(
    action: () => Promise<void>,
    targetSelector: string,
    options?: WaitForElementAfterActionOptions,
  ): Promise<ElementHandle> {
    const page = await this.connectionManager.getPage();
    return waitForElementAfterAction(page, action, targetSelector, options);
  }

  // ─── Phase 3.3: Planning + Recording + Replay ─────────────────────────────

  /**
   * Calls the backend planner and returns ordered intent steps.
   * Requires the backend to be running (or provide a mock URL for tests).
   */
  async planGoal(
    goal: string,
    backendUrl = 'http://127.0.0.1:8000',
  ): Promise<Array<{ action: string; target: string }>> {
    const res = await fetch(`${backendUrl}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, context: {} }),
    });
    if (!res.ok) throw new Error(`Planner returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { steps: Array<{ action: string; target: string }> };
    return data.steps;
  }

  /** Returns the current ActionRecorder instance. */
  getRecorder(): ActionRecorder {
    return this.recorder;
  }

  /**
   * Generates a replayable script from the most recently recorded steps
   * and clears the recorder buffer.
   */
  generateScript(goal: string): ReplayScript {
    const records = this.recorder.getRecords();
    const script = generateReplayScript(goal, records);
    this.recorder.clear();
    return script;
  }

  /** Saves a replay script as a named workflow. */
  saveWorkflow(
    goal: string,
    script: ReplayScript,
    metadata?: Record<string, unknown>,
  ): WorkflowRecord {
    return this.workflowStore.save(goal, script, metadata);
  }

  /** Retrieves a saved workflow by ID. */
  getWorkflow(id: string): WorkflowRecord | undefined {
    return this.workflowStore.get(id);
  }

  /** Finds a saved workflow by goal string. */
  findWorkflow(goal: string): WorkflowRecord | undefined {
    return this.workflowStore.findByGoal(goal);
  }

  /** Lists all saved workflows. */
  listWorkflows(): WorkflowRecord[] {
    return this.workflowStore.list();
  }

  /**
   * Replays a script deterministically (no LLM).
   * Records metrics and updates the success rate automatically.
   */
  async replayScript(script: ReplayScript): Promise<RunMetrics> {
    if (!this.connectionManager.isConnected()) {
      throw new Error('SDK is not connected. Call connect() first.');
    }
    const metrics = await this.replayEngine.replay(script);
    this.successTracker.recordRun(metrics);
    return metrics;
  }

  /** Replays a workflow by ID. */
  async replayWorkflow(id: string): Promise<RunMetrics> {
    const wf = this.workflowStore.get(id);
    if (!wf) throw new Error(`Workflow not found: ${id}`);
    return this.replayScript(wf.script);
  }

  /** Returns the SuccessRateTracker for inspection / testing. */
  getSuccessTracker(): SuccessRateTracker {
    return this.successTracker;
  }

  /** Returns the WorkflowStore for direct access. */
  getWorkflowStore(): WorkflowStore {
    return this.workflowStore;
  }
}
