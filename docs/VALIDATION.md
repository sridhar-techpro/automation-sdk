# Validation Tracker

> This file is automatically updated by `pnpm validate` after every validation run.
> Full run bundles (system-info, test-results, goal-results) are stored under `validation/run-<timestamp>/`.

---

## Latest Run

<!-- AUTO-UPDATED by scripts/validate.ts on 2026-04-11T00-14-21-691Z -->

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-04-11T00-14-21-691Z |
| **Overall status** | ❌ FAILED |
| **Total duration** | 247.0s |
| **Test suites** | 1 failed, 10 passed, 11 total |
| **Tests** | 1 failed, 246 passed, 247 total |
| **Goal scenarios** | 24 / 24 passed |

### Goal Scenarios

| # | Input | Status | Duration |
|---|-------|--------|----------|
| 1 | Suggest smartphones under 30000 with rating above 4 | ✅ | 62ms |
| 2 | phones below 30k with 4+ rating | ✅ | 64ms |
| 3 | Login to portal using email and password | ✅ | 5ms |
| 4 | Login with multi-step authentication flow | ✅ | 3ms |
| 5 | Fill leave form for tomorrow and submit | ✅ | 2ms |
| 6 | Fill multi-step form using next button and submit | ✅ | 66ms |
| 7 | Select options from dropdown and submit form | ✅ | 3ms |
| 8 | Select value from custom dropdown and continue | ✅ | 68ms |
| 9 | Choose gender using radio button and submit | ✅ | 70ms |
| 10 | Select multiple interests using checkboxes | ✅ | 82ms |
| 11 | Search and wait for results to load before clicking | ✅ | 72ms |
| 12 | Handle delayed loading elements and continue | ✅ | 69ms |
| 13 | Find employee John in table and open details | ✅ | 2ms |
| 14 | Find employee across paginated table | ✅ | 4ms |
| 15 | Click hyperlink and navigate to details page | ✅ | 2ms |
| 16 | Click custom link implemented using div and navigate | ✅ | 70ms |
| 17 | Open dashboard and download report | ✅ | 2ms |
| 18 | Navigate through multiple pages and perform action | ✅ | 66ms |
| 19 | Click button inside iframe | ✅ | 68ms |
| 20 | Interact with shadow DOM element | ✅ | 66ms |
| 21 | Open link in new tab and extract data | ✅ | 3ms |
| 22 | Perform actions while tab is in background | ✅ | 71ms |
| 23 | Handle missing elements gracefully | ✅ | 77ms |
| 24 | Retry action when element is temporarily unavailable | ✅ | 87ms |

---

## Test Suite Coverage

| Suite | File | Type |
|-------|------|------|
| Unit — AI | `tests/unit/ai.unit.test.ts` | Unit |
| Unit — Phase 2 | `tests/unit/phase2.unit.test.ts` | Unit |
| Unit — Selectors | `tests/unit/selectors.unit.test.ts` | Unit |
| E2E — SDK core | `tests/e2e/sdk.e2e.test.ts` | E2E |
| E2E — Phase 2 | `tests/e2e/phase2.e2e.test.ts` | E2E |
| E2E — Goal | `tests/e2e/goal.e2e.test.ts` | E2E |
| E2E — Phase 3 Hardening | `tests/e2e/phase3-hardening.e2e.test.ts` | E2E |

---

## Known Issues

### Flaky Behaviour

| Issue | Mitigation |
|-------|------------|
| `page.bringToFront()` destroys sibling execution contexts in headless Chrome | Use `page.evaluate()` to simulate focus |
| First `req.abort()` on cold browser can reset interception state | Warmup intercepted navigation in `beforeAll` |
| Multiple Chrome instances competing for resources | Run suites sequentially with `--runInBand` |

> See `docs/TRACEABILITY.md` for full scenario → feature mapping.
