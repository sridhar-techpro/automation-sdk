# Validation Tracker

> This file is automatically updated by `pnpm validate` after every validation run.
> Full run bundles (system-info, test-results, goal-results) are stored under `validation/run-<timestamp>/`.

---

## Latest Run

<!-- AUTO-UPDATED by scripts/validate.ts on 2026-04-11T01-53-31-908Z -->

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-04-11T01-53-31-908Z |
| **Overall status** | ✅ PASSED |
| **Total duration** | 94.2s |
| **Test suites** | 14 passed, 14 total |
| **Tests** | 280 passed, 280 total |
| **Goal scenarios** | 24 / 24 passed |
| **Success rate** | 100.0% |
| **Avg retries** | 0.01 |
| **Fallback usage** | 0.0% |

### Goal Scenarios

| # | Input | Status | Duration |
|---|-------|--------|----------|
| 1 | Suggest smartphones under 30000 with rating above 4 | ✅ | 71ms |
| 2 | phones below 30k with 4+ rating | ✅ | 72ms |
| 3 | Login to portal using email and password | ✅ | 2ms |
| 4 | Login with multi-step authentication flow | ✅ | 2ms |
| 5 | Fill leave form for tomorrow and submit | ✅ | 3ms |
| 6 | Fill multi-step form using next button and submit | ✅ | 67ms |
| 7 | Select options from dropdown and submit form | ✅ | 2ms |
| 8 | Select value from custom dropdown and continue | ✅ | 66ms |
| 9 | Choose gender using radio button and submit | ✅ | 69ms |
| 10 | Select multiple interests using checkboxes | ✅ | 74ms |
| 11 | Search and wait for results to load before clicking | ✅ | 68ms |
| 12 | Handle delayed loading elements and continue | ✅ | 74ms |
| 13 | Find employee John in table and open details | ✅ | 2ms |
| 14 | Find employee across paginated table | ✅ | 2ms |
| 15 | Click hyperlink and navigate to details page | ✅ | 2ms |
| 16 | Click custom link implemented using div and navigate | ✅ | 69ms |
| 17 | Open dashboard and download report | ✅ | 6ms |
| 18 | Navigate through multiple pages and perform action | ✅ | 81ms |
| 19 | Click button inside iframe | ✅ | 78ms |
| 20 | Interact with shadow DOM element | ✅ | 74ms |
| 21 | Open link in new tab and extract data | ✅ | 2ms |
| 22 | Perform actions while tab is in background | ✅ | 67ms |
| 23 | Handle missing elements gracefully | ✅ | 74ms |
| 24 | Retry action when element is temporarily unavailable | ✅ | 69ms |

---

## Test Suite Coverage

| Suite | File | Type | Duration |
|-------|------|------|----------|
| Unit — AI | `tests/unit/ai.unit.test.ts` | Unit | — |
| Unit — Phase 2 | `tests/unit/phase2.unit.test.ts` | Unit | — |
| Unit — Selectors | `tests/unit/selectors.unit.test.ts` | Unit | — |
| E2E — SDK core | `tests/e2e/sdk.e2e.test.ts` | E2E | — |
| E2E — Phase 2 | `tests/e2e/phase2.e2e.test.ts` | E2E | — |
| E2E — Goal | `tests/e2e/goal.e2e.test.ts` | E2E | — |
| E2E — Phase 3 Hardening | `tests/e2e/phase3-hardening.e2e.test.ts` | E2E | — |
| E2E — Replay Consistency | `tests/e2e/replay-consistency.test.ts` | E2E | — |
| E2E — Performance | `tests/e2e/performance.test.ts` | E2E | — |

---

## Known Issues

### Flaky Behaviour

| Issue | Mitigation |
|-------|------------|
| `page.bringToFront()` destroys sibling execution contexts in headless Chrome | Use `page.evaluate()` to simulate focus |
| First `req.abort()` on cold browser can reset interception state | Warmup intercepted navigation in `beforeAll` |
| Multiple Chrome instances competing for resources | Run suites sequentially with `--runInBand` |
| `spawnSync` blocks Node.js event loop → CDP stalls | Use async `spawn` with file-fd stdio |

> See `docs/TRACEABILITY.md` for full scenario → feature mapping.
