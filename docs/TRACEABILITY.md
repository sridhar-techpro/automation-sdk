# Traceability

Maps each test scenario and workflow to the features it exercises, with last
known test status.

---

## Scenario → Feature Matrix

| Scenario | Intent Type | Features Exercised | Source | Status | Last Tested |
|----------|-------------|-------------------|--------|--------|-------------|
| `Suggest smartphones under 30000 with rating above 4` | SEARCH\_PRODUCT | Intent parsing (price + rating filters), task planner (2 sites), executor, extractor, filter, aggregation | `goal.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| `phones below 30k with 4+ rating` | SEARCH\_PRODUCT | Price `k`-suffix normalisation, rating `+` syntax, same pipeline | `goal.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| `Login to portal using email and password` | LOGIN | Intent typing (LOGIN), generic task (no steps), empty topProducts | `goal.e2e.test.ts`, `phase3-hardening.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| `Fill leave form for tomorrow and submit` | FORM\_FILL | FORM\_FILL intent type, generic task | `goal.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| `Find employee John in table and open details` | TABLE\_LOOKUP | TABLE\_LOOKUP intent type, generic task | `goal.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| `Open dashboard and download report` | NAVIGATE | NAVIGATE intent type, generic task | `goal.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| Partial failure — Amazon aborted | SEARCH\_PRODUCT | Failure tolerance (per-task try-catch), Flipkart results returned | `phase3-hardening.e2e.test.ts` | ✅ | 2026-04-10 |
| Ordering — rating DESC, price ASC tie-break | SEARCH\_PRODUCT | `aggregateProducts` sort contract | `phase3-hardening.e2e.test.ts`, `ai.unit.test.ts` | ✅ | 2026-04-10 |
| Performance signal — mock interception | SEARCH\_PRODUCT | Full pipeline latency < 10s | `phase3-hardening.e2e.test.ts` | ✅ | 2026-04-10 |
| Click on visible button | — | Locator, actionability (visible), click action | `sdk.e2e.test.ts` | ✅ | 2026-04-10 |
| Retry on disabled button | — | Actionability (disabled check), `withRetry`, `ActionabilityError` | `sdk.e2e.test.ts` | ✅ | 2026-04-10 |
| Type into input | — | `type` action, selector engine | `sdk.e2e.test.ts` | ✅ | 2026-04-10 |
| Navigate with domain whitelist | — | `PolicyEnforcer`, `DomainWhitelist`, `navigate` action | `sdk.e2e.test.ts` | ✅ | 2026-04-10 |
| Multi-tab `switchToTab` | — | `TabManager`, `switchToTab` | `phase2.e2e.test.ts` | ✅ | 2026-04-10 |
| iFrame scoped locator | — | `sdk.frame().locator()`, `FrameLocator`, content frame resolution | `phase2.e2e.test.ts` | ✅ | 2026-04-10 |
| Shadow DOM element | — | `shadow=` selector, deep shadow traversal | `phase2.e2e.test.ts` | ✅ | 2026-04-10 |
| `getByRole` / `getByLabel` / `getByText` | — | Advanced selectors, Locator API | `phase2.e2e.test.ts`, `phase2.unit.test.ts` | ✅ | 2026-04-10 |
| Element stability check | — | `checkActionability({ checkStability: true })` | `phase2.e2e.test.ts` | ✅ | 2026-04-10 |
| Element coverage check | — | `checkActionability({ checkCoverage: true })` | `phase2.e2e.test.ts` | ✅ | 2026-04-10 |
| Custom dropdown (knowledge-base seed) | — | Combobox + option selection pattern | `feedback/knowledge-base.json` | 🟡 | Not yet automated |

---

## Feature → Test Coverage

| Feature | Covered By | Coverage Level |
|---------|-----------|----------------|
| `PuppeteerAdapter.connect()` / `disconnect()` | `sdk.e2e.test.ts` | Integration |
| `PuppeteerAdapter.getPage()` self-heal | `sdk.e2e.test.ts` | Integration |
| `withRetry` | `selectors.unit.test.ts`, `sdk.e2e.test.ts` | Unit + Integration |
| `checkActionability` (all checks) | `phase2.unit.test.ts`, `phase2.e2e.test.ts` | Unit + Integration |
| `resolveSelector` (all types) | `selectors.unit.test.ts`, `phase2.e2e.test.ts` | Unit + Integration |
| Fluent Locator chain | `phase2.unit.test.ts`, `phase2.e2e.test.ts` | Unit + Integration |
| `parseIntent` (all types + filters) | `ai.unit.test.ts` | Unit (comprehensive) |
| `planTasks` | `ai.unit.test.ts` | Unit |
| `extractProductsFromHTML` | `ai.unit.test.ts` | Unit |
| `filterProducts` | `ai.unit.test.ts` | Unit |
| `aggregateProducts` (sort + top-N) | `ai.unit.test.ts`, `phase3-hardening.e2e.test.ts` | Unit + Integration |
| `runGoal` (full pipeline) | `ai.unit.test.ts`, `goal.e2e.test.ts`, `phase3-hardening.e2e.test.ts` | Unit + E2E |
| `PolicyEnforcer` / `DomainWhitelist` | `sdk.e2e.test.ts` | Integration |
| `TabManager` | `phase2.e2e.test.ts` | Integration |
| `ActionLogger` | `sdk.e2e.test.ts` | Integration |
| Validation pipeline | `scripts/validate.ts` (self-validates) | System |
| Knowledge base | — | ❌ Not yet covered |
| Trace writes | — | ❌ Not yet covered |

---

## Status Key

| Icon | Meaning |
|------|---------|
| ✅ | Passing in latest run |
| 🟡 | Partially implemented — not in automated test |
| ❌ | Not yet covered |
