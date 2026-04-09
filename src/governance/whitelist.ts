export class DomainWhitelist {
  private domains: Set<string> = new Set();

  add(domain: string): void {
    this.domains.add(domain.toLowerCase());
  }

  isAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      for (const domain of this.domains) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  getAll(): string[] {
    return Array.from(this.domains);
  }
}
