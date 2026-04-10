# Validation Tracker

This file is automatically updated by `pnpm validate` after every validation run.
Manual entries below represent the initial state before the first automated update.

---

## Latest Run

<!-- AUTO-UPDATED by scripts/validate.ts -->

| Field | Value |
|-------|-------|
| **Timestamp** | 2026-04-10T14-35-37-358Z |
| **Overall status** | ✅ PASSED |
| **Total duration** | 27.2s |
| **Test suites** | 6 passed, 6 total |
| **Tests** | 145 passed, 145 total |
| **Goal scenarios** | 6 / 6 passed |

### Goal Scenarios

| # | Input | Status | Duration |
|---|-------|--------|----------|
| 1 | Suggest smartphones under 30000 with rating above 4 | ✅ | 62ms |
| 2 | phones below 30k with 4+ rating | ✅ | 65ms |
| 3 | Login to portal using email and password | ✅ | 5ms |
| 4 | Fill leave form for tomorrow and submit | ✅ | 2ms |
| 5 | Find employee John in table and open details | ✅ | 8ms |
| 6 | Open dashboard and download report | ✅ | 6ms |

---

## Historical Runs

| Run ID | Timestamp | Suites | Tests | Scenarios | Overall |
|--------|-----------|--------|-------|-----------|---------|
| run-2026-04-10T14-35-37-358Z | 2026-04-10 14:35 UTC | 6/6 | 145/145 | 6/6 | ✅ |

> Full run bundles are stored under `validation/run-<timestamp>/`.

---

## Test Suite Coverage

| Suite | File | Tests | Type |
|-------|------|-------|------|
| Unit — AI | `tests/unit/ai.unit.test.ts` | 60+ | Unit |
| Unit — Phase 2 | `tests/unit/phase2.unit.test.ts` | 20+ | Unit |
| Unit — Selectors | `tests/unit/selectors.unit.test.ts` | 15+ | Unit |
| E2E — SDK core | `tests/e2e/sdk.e2e.test.ts` | 20+ | E2E |
| E2E — Phase 2 | `tests/e2e/phase2.e2e.test.ts` | 15+ | E2E |
| E2E — Goal | `tests/e2e/goal.e2e.test.ts` | 8 | E2E |
| E2E — Phase 3 Hardening | `tests/e2e/phase3-hardening.e2e.test.ts` | 4 | E2E |

---

## Known Issues

### Flaky Behaviour

| Issue | Affected Suite | Mitigation |
|-------|---------------|------------|
| `page.bringToFront()` destroys sibling execution contexts in headless Chrome | All E2E suites | Use `page.evaluate()` to simulate focus — never call `bringToFront()` |
| First `req.abort()` on cold browser can reset interception state | `phase3-hardening.e2e.test.ts` | Warmup intercepted navigation in `beforeAll` |
| Two+ Chrome instances competing for resources cause flaky timeouts | Running all E2E suites together | Run suites sequentially with `--runInBand`; use `--testTimeout=120000` |
| Closing a tab mid-suite while SDK is connected triggers `executionContextsCleared` | `sdk.e2e.test.ts` | Never call `page.close()` mid-suite; let `browser.close()` in `afterAll` clean up |

### Performance Notes

| Scenario | Observed | Threshold |
|----------|----------|-----------|
| `executeGoal` with mock interception | ~65ms | < 10s (soft bound) |
| Full validation run | ~27s | — |

### Limitations Not Covered by Tests

- Real amazon.in / flipkart.com HTML structures are not tested (mock interception is used exclusively)
- LLM fallback path not tested (not yet implemented)
- Global knowledge sync not tested (not yet implemented)
