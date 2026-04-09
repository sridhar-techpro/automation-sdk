import { DomainWhitelist } from './whitelist';

export class PolicyViolationError extends Error {
  constructor(url: string) {
    super(`Policy violation: domain not allowed for URL "${url}"`);
    this.name = 'PolicyViolationError';
  }
}

export class PolicyEnforcer {
  private whitelist: DomainWhitelist;

  constructor(whitelist: DomainWhitelist) {
    this.whitelist = whitelist;
  }

  enforce(url: string): void {
    if (this.whitelist.getAll().length === 0) {
      return;
    }
    if (!this.whitelist.isAllowed(url)) {
      throw new PolicyViolationError(url);
    }
  }
}
