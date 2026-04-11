# Roadmap

This document tracks the feature delivery roadmap across all phases.

---

## Phase 1 — Execution Engine ✅

> **Goal:** Reliable CDP-based browser automation with retry and observability.

| Feature | Status | Source |
|---------|--------|--------|
| `puppeteer-core` CDP connection | ✅ | `src/engine/puppeteer-adapter.ts` |
| Connection manager with page self-healing | ✅ | `src/engine/connection-manager.ts` |
| `execute()` — click / type / navigate / screenshot | ✅ | `src/core/action.ts` |
| Exponential-backoff retry (`withRetry`) | ✅ | `src/reliability/retry.ts` |
| Wait utilities (`sleep`) | ✅ | `src/reliability/wait.ts` |
| Action logger with ISO timestamps | ✅ | `src/tracer/logger.ts` |

---

## Phase 2 — Playwright-Level SDK ✅

> **Goal:** Developer-friendly, resilient selector and interaction layer on top of Phase 1.

| Feature | Status | Source |
|---------|--------|--------|
| Multi-selector engine: CSS, XPath, `text=`, `text*=`, `shadow=` | ✅ | `src/selectors/selector-engine.ts` |
| Advanced selectors: `getByRole`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `getByText` | ✅ | `src/selectors/advanced-selectors.ts` |
| Fluent Locator API (`nth`, `first`, `last`, `filter`, `locator`) | ✅ | `src/locator/locator.ts` |
| Actionability checks: visible, attached, enabled, stable (50 ms), not-covered | ✅ | `src/reliability/actionability.ts` |
| Shadow DOM traversal (`shadow=<css>`) | ✅ | `src/selectors/selector-engine.ts` |
| iframe / nested-frame scoped locator (`sdk.frame(sel).locator(sel)`) | ✅ | `src/frame/frame-locator.ts` |
| Multi-tab: `getTabs`, `switchToTab`, `executeOnTab` | ✅ | `src/tabs/tab-manager.ts` |
| Domain governance: whitelist + `PolicyEnforcer` | ✅ | `src/governance/` |

---

## Phase 3 — AI Layer

> **Goal:** Natural-language goal execution over multiple sites with structured output.

### 3.1 — Intent + Task Execution ✅

| Feature | Status | Source |
|---------|--------|--------|
| `parseIntent` — keyword + regex intent typing | ✅ | `src/ai/intent-parser.ts` |
| Intent types: `SEARCH_PRODUCT`, `LOGIN`, `FORM_FILL`, `NAVIGATE`, `TABLE_LOOKUP` | ✅ | `src/ai/types.ts` |
| Filter extraction: `priceMax`, `ratingMin`, `query` | ✅ | `src/ai/intent-parser.ts` |
| `planTasks` — intent → site-specific task list | ✅ | `src/ai/task-planner.ts` |
| `executeTask` — navigate + extract per task | ✅ | `src/ai/executor.ts` |
| `runGoal` — full pipeline with per-task failure tolerance | ✅ | `src/ai/goal-runner.ts` |
| `sdk.executeGoal(input)` — public API entry point | ✅ | `src/core/sdk.ts` |

### 3.2 — Multi-site Extraction & Aggregation ✅

| Feature | Status | Source |
|---------|--------|--------|
| `extractProductsFromHTML` — pure HTML parser | ✅ | `src/ai/extractor.ts` |
| `extractProducts` — live page → product list | ✅ | `src/ai/extractor.ts` |
| `filterProducts` — price and rating filters | ✅ | `src/ai/aggregator.ts` |
| `aggregateProducts` — sort (rating DESC, price ASC) + top-2 slice | ✅ | `src/ai/aggregator.ts` |
| Default multi-site: Amazon + Flipkart for `SEARCH_PRODUCT` | ✅ | `src/ai/task-planner.ts` |

### 3.x — Hardening 🟡

| Feature | Status | Notes |
|---------|--------|-------|
| Validation pipeline (`pnpm validate`) | ✅ | `scripts/validate.ts` |
| Timestamped run bundles under `validation/run-*/` | ✅ | system-info, test-results, goal-results, summary, errors |
| Automated `docs/VALIDATION.md` update | ✅ | Written on every `pnpm validate` run |
| Phase 3 hardening E2E tests (partial-failure, ordering, non-ecommerce, perf) | ✅ | `tests/e2e/phase3-hardening.e2e.test.ts` |
| Local knowledge base foundation | 🟡 | `feedback/knowledge-base.json` — file exists, active loop not yet wired |
| Trace storage directory | 🟡 | `feedback/traces/` — directory exists, writing not yet automated |
| Feedback loop — active learning on failures | 🟡 | Planned for Phase 3.x completion |

---

## Phase 3.3 — LLM Integration ❌ (Next)

> **Goal:** Replace deterministic regex planning with LLM-driven intent understanding and dynamic task generation.

- Integrate `AzureChatOpenAI` (or equivalent) for intent parsing fallback
- Dynamic task planning for goals the regex parser cannot handle
- Structured output parsing from LLM responses
- Graceful degradation when LLM is unavailable

---

## Phase 3.4 — Semantic Matching + Feedback Loop 🟡

> **Goal:** Cross-session recall of successful workflows, semantic matching, and active learning from failures.

| Feature | Status | Source |
|---------|--------|--------|
| Semantic workflow matching (keyword + backend LLM) | ✅ | `src/workflow/semantic-matcher.ts` |
| `WorkflowStore.findByKeyword()` — Jaccard token similarity | ✅ | `src/workflow/workflow-store.ts` |
| `FailureStore` — persists failure records to JSON | ✅ | `src/feedback/failure-store.ts` |
| `KnowledgeStore` — loads/saves knowledge entries, handles legacy format | ✅ | `src/feedback/knowledge-store.ts` |
| `FeedbackLoop` — captures failures, CLI fix prompt, learns from fixes | ✅ | `src/feedback/feedback-loop.ts` |
| Self-healing replay via `KnowledgeStore` in `ReplayEngine` | ✅ | `src/replay/replay-engine.ts` |
| `sdk.findBestWorkflow()` — exact → keyword → semantic | ✅ | `src/core/sdk.ts` |
| `sdk.getFeedbackLoop()` / `sdk.getKnowledgeStore()` | ✅ | `src/core/sdk.ts` |
| Backend `/match-workflow` endpoint (keyword + optional LLM) | ✅ | `backend/matcher.py`, `backend/main.py` |
| E2E tests for all new features | ✅ | `tests/e2e/phase34-semantic.e2e.test.ts` |

---

## Phase 4 — Distributed Learning ❌

> **Goal:** Aggregate anonymised learnings across deployments to improve baseline behaviour.

- Global knowledge base service
- Pattern sharing and de-duplication
- Privacy-preserving aggregation (no raw page content or credentials)
- Pull-model: local agent fetches relevant patterns on demand

---

## Status Key

| Icon | Meaning |
|------|---------|
| ✅ | Built, tested, and stable |
| 🟡 | Foundation in place; not fully active |
| ❌ | Planned; not started |
