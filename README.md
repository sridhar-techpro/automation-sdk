# automation-sdk

> Universal AI-Native Browser Automation Platform

A production-grade SDK that unifies low-level Chrome DevTools Protocol (CDP)
execution, a Playwright-level locator/actionability layer, and a deterministic
AI pipeline that converts natural-language goals into multi-site browser workflows.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Consumer (test / script / CLI)                                │
│                                                                │
│  sdk.executeGoal("Suggest smartphones under 30000 …")          │
│  sdk.locator("button[type=submit]").click()                    │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│  AI Layer  (src/ai/)                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ IntentParser│→ │ TaskPlanner  │→ │ Executor/Extractor │    │
│  │ (regex/kw)  │  │ (site→URL)   │  │ + Aggregator       │    │
│  └─────────────┘  └──────────────┘  └────────────────────┘    │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│  Core SDK  (src/core/, src/locator/, src/selectors/, …)        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Locator  │ │ Selector │ │ Actions  │ │ Governance       │  │
│  │ (fluent) │ │ Engine   │ │ click/   │ │ whitelist+policy │  │
│  │          │ │ CSS/XPath│ │ type/nav │ │                  │  │
│  │          │ │ text/    │ │          │ │                  │  │
│  │          │ │ shadow   │ │          │ │                  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└────────────────────┬───────────────────────────────────────────┘
                     │
┌────────────────────▼───────────────────────────────────────────┐
│  Engine  (src/engine/)                                         │
│  PuppeteerAdapter — CDP via puppeteer-core                     │
│  ConnectionManager — connect / reconnect / page self-heal      │
└────────────────────┬───────────────────────────────────────────┘
                     │
                Chrome (CDP)
```

**Four layers:**

| Layer | Location | Responsibility |
|-------|----------|----------------|
| SDK (execution) | `src/core/`, `src/engine/`, `src/locator/`, `src/selectors/`, `src/reliability/`, `src/tabs/`, `src/frame/`, `src/governance/`, `src/tracer/` | CDP-based browser control, locator resolution, retry, actionability, tab management, domain governance, action logging |
| AI Layer | `src/ai/` | Natural-language → intent → tasks → execution → product extraction → aggregation |
| Knowledge Layer | `feedback/` | Local knowledge base for selector fixes and workflow patterns (foundation in place; active learning loop planned) |
| Validation Layer | `scripts/validate.ts`, `validation/` | Automated validation pipeline — runs all test suites + goal scenarios + writes timestamped reports |

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run all tests
pnpm test

# Run unit tests only
pnpm run test:unit

# Run E2E tests (requires Chrome at /usr/bin/google-chrome)
pnpm run test:e2e

# Run full validation pipeline
pnpm run validate
```

---

## Feature Matrix

| Feature | Status | Phase | Type | Notes |
|---------|--------|-------|------|-------|
| CDP Execution (click / type / navigate / screenshot) | ✅ | Phase 1 | Core | stable |
| Connection manager with self-healing page recovery | ✅ | Phase 1 | Core | stable |
| Exponential-backoff retry (`withRetry`) | ✅ | Phase 1 | Reliability | stable |
| Action logger / trace steps | ✅ | Phase 1 | Observability | stable |
| Wait utilities (`waitForSelector`, `sleep`) | ✅ | Phase 1 | Core | stable |
| Multi-selector engine (CSS / XPath / text= / text\*= / shadow=) | ✅ | Phase 2 | Core | stable |
| Advanced selectors (`getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `getByText`) | ✅ | Phase 2 | Core | stable |
| Fluent Locator API (`nth`, `first`, `last`, `filter`, `locator`) | ✅ | Phase 2 | Core | stable |
| Actionability checks (visible / attached / enabled / stable / not-covered) | ✅ | Phase 2 | Reliability | stable |
| Shadow DOM traversal | ✅ | Phase 2 | Core | stable |
| iFrame / nested-frame support | ✅ | Phase 2 | Core | stable |
| Multi-tab orchestration (`getTabs`, `switchToTab`, `executeOnTab`) | ✅ | Phase 2 | Core | stable |
| Domain governance (whitelist + policy enforcer) | ✅ | Phase 2 | Governance | stable |
| Intent parsing (SEARCH\_PRODUCT / LOGIN / FORM\_FILL / NAVIGATE / TABLE\_LOOKUP) | ✅ | Phase 3 | AI | deterministic regex |
| Task planner (intent → site-specific tasks) | ✅ | Phase 3 | AI | stable |
| Multi-task executor (sequential, per-site) | ✅ | Phase 3 | AI | stable |
| HTML product extractor | ✅ | Phase 3 | AI | stable |
| Filter + aggregation pipeline (price / rating / top-N) | ✅ | Phase 3 | AI | stable |
| Failure tolerance (per-task try-catch in goal-runner) | ✅ | Phase 3 | Reliability | stable |
| Validation pipeline (`pnpm validate`) | ✅ | Phase 3 | Observability | stable |
| Automated VALIDATION.md update | ✅ | Phase 3 | Observability | on each validate run |
| Feedback loop / active learning | 🟡 | Phase 3 | Learning | foundation only |
| Local knowledge base | 🟡 | Phase 3 | Learning | file exists; not active |
| LLM integration (dynamic planning) | ❌ | Phase 3.3 | AI | planned |
| Memory system (cross-session recall) | ❌ | Phase 3.4 | AI | planned |
| Global knowledge sync | ❌ | Phase 4 | Learning | planned |

**Status key:** ✅ built & tested · 🟡 foundation in place · ❌ planned

---

## Test Coverage

| Suite | Tests | Description |
|-------|-------|-------------|
| `tests/unit/ai.unit.test.ts` | 60+ | Intent parsing, task planning, extraction, aggregation, goal-runner |
| `tests/unit/phase2.unit.test.ts` | 20+ | Locator API, selector engine, advanced selectors, actionability |
| `tests/unit/selectors.unit.test.ts` | 15+ | Selector parsing and retry |
| `tests/e2e/sdk.e2e.test.ts` | 20+ | Core SDK actions against real Chrome |
| `tests/e2e/phase2.e2e.test.ts` | 15+ | Locator, frame, multi-tab, actionability against real Chrome |
| `tests/e2e/goal.e2e.test.ts` | 8 | End-to-end `executeGoal` with mock-intercepted pages |
| `tests/e2e/phase3-hardening.e2e.test.ts` | 4 | Partial failure, ordering, non-ecommerce, performance |

**Latest result: 145 tests passed across 6 suites (+ 4 new in phase3-hardening)**

---

## Docs

| Document | Purpose |
|----------|---------|
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase-by-phase feature delivery roadmap |
| [docs/CAPABILITIES.md](docs/CAPABILITIES.md) | What the system can and cannot do |
| [docs/VALIDATION.md](docs/VALIDATION.md) | Latest validation results + history |
| [docs/LEARNING.md](docs/LEARNING.md) | Learning system architecture |
| [docs/TRACEABILITY.md](docs/TRACEABILITY.md) | Scenario → feature mapping |
| [docs/DESIGN.md](docs/DESIGN.md) | Design principles and constraints |

---

## Package Manager

This repository uses **pnpm** (v9.0.0). Always install with:

```bash
pnpm install
```

Do **not** use `npm install` — the lockfile is `pnpm-lock.yaml`.
