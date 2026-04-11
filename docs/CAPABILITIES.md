# Capabilities

What the automation-sdk can do today, what is partially implemented, and what
is explicitly out of scope until a future phase.

---

## Current Capabilities

### Browser Automation (Phase 1 + 2)

| Capability | Detail |
|-----------|--------|
| **CDP connection** | Connects to any Chrome / Chromium instance via WebSocket endpoint (`browserWSEndpoint`). No bundled browser. |
| **Self-healing page** | `ConnectionManager.getPage()` detects a closed or null page and recovers by reusing an existing open page or opening a new blank page before returning. |
| **Click** | Resolves element, checks actionability, dispatches click. Retried on `ActionabilityError`. |
| **Type** | Clears existing value, types character-by-character. Retried on `ActionabilityError`. |
| **Navigate** | `page.goto()` with domain-whitelist enforcement. |
| **Screenshot** | Full-page buffer via `page.screenshot()`. |
| **Exponential-backoff retry** | `withRetry(fn, { retries, delay, backoff })` — configurable retries with multiplicative delay. |
| **Actionability checks** | Verifies element is: attached to DOM (incl. shadow DOM via `isConnected`), visible (CSS + dimensions), not disabled, optionally stable (no layout shift over 50 ms), optionally not covered by an overlapping element. |
| **Selector engine** | CSS, XPath (`xpath=` prefix or bare `//`), exact text (`text=`), partial text (`text*=`), shadow DOM (`shadow=`). |
| **Advanced selectors** | `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `getByText` — all translate to CSS/XPath under the hood. |
| **Fluent Locator API** | Chain `.nth(n)`, `.first()`, `.last()`, `.filter(selector)`, `.locator(child)` — all lazy (resolved only at action time). |
| **iFrame support** | `sdk.frame(frameSelector).locator(innerSelector)` — resolves the frame's content document before applying the inner selector. |
| **Multi-tab** | `getTabs()`, `switchToTab(index)`, `executeOnTab(index, fn)` — operates on existing pages, never spawns new ones mid-session. |
| **Domain governance** | `DomainWhitelist` + `PolicyEnforcer` — navigation is blocked with `PolicyViolationError` when a whitelist is configured and the target URL is not on it. |
| **Action logging** | Every action result (success/failure, duration, timestamp) written to an in-memory log accessible via `sdk.getLogs()`. Fine-grained trace steps (selector resolution, retry attempts) available via `ActionLogger.getSteps()`. |

---

### AI Pipeline (Phase 3)

| Capability | Detail |
|-----------|--------|
| **Intent parsing** | Converts a natural-language string to a typed `Intent` (type, filters, sites). Fully deterministic — no LLM calls. |
| **Intent types** | `SEARCH_PRODUCT`, `LOGIN`, `FORM_FILL`, `NAVIGATE`, `TABLE_LOOKUP`. |
| **Filter extraction** | Extracts `priceMax` (with `k`/`K` suffix support), `ratingMin`, and product `query` from the goal string. |
| **Task planning** | Generates one `Task` per site for `SEARCH_PRODUCT`; one generic task (no steps) for other intent types. |
| **Multi-site search** | Default sites for `SEARCH_PRODUCT`: `amazon.in` and `flipkart.com`. Overridable by naming a site in the goal string. |
| **Product extraction** | Parses `<article class="product-item">` blocks from live page HTML — title, price, rating. Site-agnostic. |
| **Filtering** | `price < priceMax` AND `rating > ratingMin` (strict inequalities). |
| **Aggregation** | Merges results from all sites, sorts by rating DESC then price ASC, returns top 2. |
| **Failure tolerance** | Each task is wrapped in try-catch inside `runGoal`. A failed task (e.g. network error, abort) is logged and skipped; remaining tasks continue. |

---

### Validation & Observability (Phase 3)

| Capability | Detail |
|-----------|--------|
| **Validation pipeline** | `pnpm validate` runs all Jest suites + goal scenarios + produces a timestamped bundle under `validation/run-*/`. |
| **Run bundle contents** | `system-info.json`, `test-results.log`, `goal-results.json`, `summary.md`, `errors.log` (only on failure). |
| **VALIDATION.md sync** | `docs/VALIDATION.md` is overwritten with the latest run summary after every `pnpm validate`. |

---

## Learning Capabilities (Phase 3.4 — Active)

| Capability | Status | Detail |
|-----------|--------|--------|
| **Semantic workflow matching** | ✅ | `SemanticMatcher` — keyword Jaccard similarity + optional backend LLM semantic match |
| **Active feedback loop** | ✅ | `FeedbackLoop` — captures failures, prompts for fixes in TTY, learns from user corrections |
| **Self-healing replay** | ✅ | `ReplayEngine` uses `KnowledgeStore` to try fix selectors when all known selectors fail |
| **Failure store** | ✅ | `FailureStore` — persists `FailureRecord[]` to `feedback/failures.json` |
| **Knowledge store** | ✅ | `KnowledgeStore` — loads/saves `KnowledgeEntry[]`, handles legacy string-fix format |
| **Knowledge base** | ✅ | `feedback/knowledge-base.json` — actively read and written at runtime |
| **Trace storage** | 🟡 | `feedback/traces/` directory exists; automated writes not yet implemented |
| **Global learning** | ❌ | Planned for Phase 4 — cross-instance pattern sharing |

---

## Limitations

| Limitation | Detail |
|-----------|--------|
| **No LLM reasoning** | Intent parsing and task planning are entirely rule-based (regex + keyword matching). Goals outside the known patterns produce generic empty-step tasks. |
| **Limited semantic understanding** | The system understands a fixed vocabulary of intent types. Ambiguous or complex goals may be misclassified. |
| **HTML structure dependency** | Product extraction relies on `<article class="product-item">` markup. Real Amazon/Flipkart pages use different DOM structures — the extractor requires site-specific adapters for production use. |
| **No global learning** | Knowledge is local to a single deployment. There is no cross-instance pattern sharing. |
| **No credential/session management** | `LOGIN` intent produces a generic empty task; the caller must implement the actual login workflow via the Locator API. |
| **No memory across sessions** | Each `AutomationSDK` instance starts fresh. Past execution context is not automatically reused. |
| **Headless Chrome only (E2E)** | E2E tests are validated against system Chrome at `/usr/bin/google-chrome`. Other browsers are not tested. |
| **Single active page per SDK instance** | The SDK tracks one primary page. Multi-tab operations require explicit `switchToTab` / `executeOnTab` calls. |
