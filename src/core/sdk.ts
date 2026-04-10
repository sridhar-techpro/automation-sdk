import type { Page } from 'puppeteer-core';
import { ActionPayload, ActionResult, SDKConfig } from './types';
import { ConnectionManager } from '../engine/connection-manager';
import { ActionLogger } from '../tracer/logger';
import { DomainWhitelist } from '../governance/whitelist';
import { PolicyEnforcer } from '../governance/policy';
import { executeClick, executeNavigate, executeType } from './action';

export class AutomationSDK {
  private config: SDKConfig;
  private connectionManager: ConnectionManager;
  private logger: ActionLogger;
  private whitelist: DomainWhitelist;
  private policyEnforcer: PolicyEnforcer;

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
}
