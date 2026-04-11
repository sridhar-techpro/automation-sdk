# Learning System

This document describes the learning architecture — what exists today as
foundation infrastructure and what is planned for active learning.

---

## Overview

The learning system is designed as a **hybrid model**: a local knowledge base
stores deployment-specific fixes and patterns; a future global tier will
aggregate anonymised learnings across deployments.

```
┌──────────────────────────────────────────────────────┐
│  Goal Execution                                      │
│  sdk.executeGoal(input)                              │
└────────────────┬─────────────────────────────────────┘
                 │ success / failure
                 ▼
┌──────────────────────────────────────────────────────┐
│  Local Knowledge Layer        (Phase 3.x — planned)  │
│  feedback/knowledge-base.json                        │
│  feedback/traces/                                    │
│                                                      │
│  ┌──────────────────┐  ┌───────────────────────────┐ │
│  │ Pattern store    │  │ Trace store               │ │
│  │ selector fixes   │  │ per-execution metadata    │ │
│  │ workflow patches │  │ failures + durations      │ │
│  └──────────────────┘  └───────────────────────────┘ │
└────────────────┬─────────────────────────────────────┘
                 │ (Phase 4 — planned)
                 ▼
┌──────────────────────────────────────────────────────┐
│  Global Knowledge Sync        (Phase 4)              │
│  anonymised pattern aggregation                      │
└──────────────────────────────────────────────────────┘
```

---

## Local Learning

### Storage Location

```
feedback/
├── knowledge-base.json   ← pattern store (read/write)
└── traces/               ← per-execution trace files (planned)
```

### Knowledge Base Schema

```json
[
  {
    "pattern": "<short description of the scenario>",
    "fix": "<what to do when this pattern is encountered>",
    "confidence": 0.0,
    "source": "local | user | inferred",
    "lastUpdated": "ISO-8601 timestamp"
  }
]
```

### Current State

`feedback/knowledge-base.json` contains seed entries covering known edge cases
(e.g. custom dropdowns). The file is **read-only at runtime** in the current
implementation — the active feedback loop that writes new entries on failure is
planned for Phase 3.x completion.

### Active Loop (Phase 3.4 — Implemented)

1. `executeGoal` or a replay step fails after exhausting retries.
2. `FeedbackLoop.captureFailure()` persists the failure to `feedback/failures.json`.
3. In interactive (TTY) mode, `FeedbackLoop.promptFix()` offers a CLI menu to choose a fix type (text / role / css / skip).
4. `FeedbackLoop.learnFromFix()` writes a `KnowledgeEntry` to `feedback/knowledge-base.json` with `confidence: 0.7` and `source: "user"`.
5. On the next replay, `ReplayEngine` calls `knowledgeStore.match(goal, stepTarget)` after all selectors fail. If a matching entry exists (with `fix.type !== 'skip'`), the fix selector is tried; if it succeeds, it is promoted into `step.selector.fallbacks` for future runs.
6. `sdk.findBestWorkflow()` uses `SemanticMatcher` to find relevant workflows via keyword Jaccard similarity (≥ 0.75) or backend LLM semantic matching.

---

## Trace Storage

### Location

```
feedback/traces/
```

Each trace file will be a JSON document capturing:

- Goal input
- Parsed intent
- Tasks planned
- Per-task results (success, products extracted, duration)
- Any errors and the retry history
- Timestamp

Traces are used as the raw material for the feedback loop — failures are
re-analysed to propose knowledge-base entries.

### Current State

The directory exists. Automated trace writing is not yet implemented.

---

## Learning Types

| Type | Trigger | Storage Key | Example |
|------|---------|-------------|---------|
| Selector fix | Element not found after N retries | `pattern: "product-title on <site>"` | Amazon changed `.a-text-normal` to `.a-link-normal` |
| Workflow correction | Task times out or page never loads | `pattern: "amazon search flow"` | Navigate to `/s` before typing in search box |
| Retry strategy | Consistent timeout on a specific action | `pattern: "flipkart add-to-cart"` | Increase wait before clicking — button is JS-hydrated |
| Filter calibration | Zero results despite valid products on page | `pattern: "price filter 30k"` | Page shows "₹28,000" not "28000" — normalisation needed |

---

## Global Learning (Phase 4 — Planned)

The global knowledge sync is explicitly **not started**. When planned:

- Only anonymised patterns will be shared — no page content, no credentials, no URLs with personal data.
- Agents will pull relevant patterns on demand (not push automatically).
- A confidence threshold will gate whether a globally-sourced pattern is applied locally.
- All global patterns will be versioned and attributable to a pattern schema version.
