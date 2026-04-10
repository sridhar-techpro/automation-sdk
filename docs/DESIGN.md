# Design Principles

Core architectural decisions that guide every feature in this SDK.
These are constraints, not guidelines — deviating from them requires an explicit
decision and a documentation update.

---

## 1. Domain-Agnostic Design

The SDK must work on any web page without prior knowledge of its structure.

- No hardcoded selectors for specific sites (e.g. Amazon, Flipkart, Gmail).
- The locator system is selector-agnostic: CSS, XPath, text content, ARIA role, shadow DOM.
- The AI pipeline's extractor relies on a documented markup contract (`<article class="product-item">`), not on site-specific DOM paths.
- Site-specific logic lives in adapters or test fixtures, never in core source files.

---

## 2. No Hardcoded Selectors in Core

Selectors are always supplied by the caller (test, script, or AI planner).

- `sdk.locator(selector)` — caller provides the selector.
- `sdk.getByRole(role)` — resolves to a generated selector at call time.
- The selector engine translates semantic selectors to puppeteer-compatible CSS/XPath internally, but stores no page-specific knowledge.

---

## 3. SDK-First Execution

All browser interaction goes through the SDK's action layer.

- Raw `page.goto()`, `page.click()`, etc., are allowed only in `src/core/action.ts`, `src/ai/executor.ts`, and test setup code.
- Application code and AI pipeline code always call `sdk.execute()`, `sdk.locator().click()`, or `sdk.executeGoal()`.
- This ensures retry, actionability checks, logging, and governance are always applied.

---

## 4. Deterministic Before AI

Wherever a rule-based solution is sufficient, prefer it over an AI/LLM approach.

- Intent parsing is fully deterministic (keyword + regex). No LLM call unless the deterministic parser returns a low-confidence result.
- Task planning is rule-based (intent type → fixed URL templates). Dynamic planning is a future enhancement, not a baseline requirement.
- This makes the system predictable, testable, and free of external API dependencies for the common case.

---

## 5. Fail-Tolerant, Not Fail-Fast

Individual task failures must not abort the entire goal execution.

- `runGoal` wraps each task in try-catch and skips failed tasks with a warning log.
- Partial results (from the remaining tasks) are always returned.
- The caller sees a valid `GoalResult` even when some tasks fail — they inspect `topProducts` to determine if enough data was collected.
- Hard failures (not connected, invalid config) throw immediately — only runtime task failures are tolerated.

---

## 6. Layered Testability

Every layer must be independently testable.

- Pure functions (intent parser, extractor, aggregator, filter) are unit-tested with no browser.
- The Locator API and actionability checks are unit-tested with mock pages/elements.
- E2E tests use Puppeteer request interception to serve deterministic mock HTML — no dependency on real third-party sites.
- The validation pipeline (`pnpm validate`) is the integration-level gate that exercises the full stack including a real Chrome instance.

---

## 7. Hybrid Learning Model (Local + Global)

Learning is structured in two tiers to balance privacy, latency, and coverage.

- **Local tier** (`feedback/knowledge-base.json`): fast, private, deployment-specific. Applied first.
- **Global tier** (Phase 4): opt-in, anonymised, aggregated across deployments. Applied as a fallback when local knowledge has no match.
- No user credentials, page content, or identifiable data ever leave the local tier.
- Confidence scores gate whether a learned pattern is applied in production, preventing a single bad sample from corrupting behaviour.

---

## 8. pnpm-Only Dependency Management

This repository uses `pnpm` (v9.0.0) as its sole package manager.

- The lockfile is `pnpm-lock.yaml`. Do not commit `package-lock.json` or `yarn.lock`.
- All install, build, test, and validate commands use `pnpm` prefixes.
- The `"packageManager": "pnpm@9.0.0"` field in `package.json` enforces this via Corepack.

---

## 9. Observe, Don't Interfere

The SDK attaches to an existing Chrome instance rather than managing its lifecycle.

- `connect(wsEndpoint)` — attaches via WebSocket; does not launch Chrome.
- `disconnect()` — detaches the WebSocket; does not close Chrome.
- Tab management never calls `bringToFront()` in headless mode (causes execution-context destruction on sibling tabs).
- This makes the SDK safe to use alongside browser extensions, DevTools, and other automation agents.

---

## 10. Explicit Over Implicit

Configuration and behaviour must be explicit.

- `SDKConfig.allowedDomains` must be set to enable domain governance — it is off by default.
- `ActionabilityOptions.checkStability` and `checkCoverage` are opt-in — off by default to avoid unnecessary 50 ms waits.
- `browserWSEndpoint` defaults to `ws://localhost:9222` as a convenience, but callers should supply the real endpoint in production.
- Retry parameters (`retries`, `delay`, `backoff`) are always caller-supplied; there are no hidden global defaults beyond the documented fallbacks.
