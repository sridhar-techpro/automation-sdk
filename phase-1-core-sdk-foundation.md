# 🚀 TASK: Build Production-Grade Automation SDK (CDP + Puppeteer Core)

---

## 🧠 ROLE

You are a senior systems engineer building a **production-grade Automation SDK**.

This is NOT a prototype.

---

## 🎯 OBJECTIVE

Build an **Automation SDK** that:

* Uses Puppeteer Core as execution engine
* Works via CDP connection (Chrome DevTools Protocol)
* Is designed for future Chrome Extension integration
* Supports reliable background execution (no tab focus required)

---

## 🏗️ ARCHITECTURE (STRICT)

SDK (PRIMARY CONTROL LAYER)
↓
Puppeteer Core (EXECUTION ENGINE)
↓
CDP (Chrome DevTools Protocol)
↓
Browser

---

## 🚨 HARD CONSTRAINTS

1. SDK ONLY — DO NOT BUILD:

   * Chrome extension
   * UI
   * Backend

2. DO NOT:

   * Reimplement Puppeteer
   * Use Playwright
   * Add unnecessary abstraction layers

3. MUST:

   * Use Puppeteer Core
   * Connect to Chrome via CDP (remote debugging port)

---

## 📦 PROJECT STRUCTURE (MANDATORY)

src/
core/
sdk.ts
action.ts
types.ts

engine/
puppeteer-adapter.ts
connection-manager.ts

selectors/
selector-engine.ts
text-selector.ts
css-selector.ts

reliability/
wait.ts
retry.ts
actionability.ts

governance/
whitelist.ts
policy.ts

tracer/
logger.ts

tests/
e2e/
unit/

---

## 🧩 PHASE 1 — CDP + PUPPETEER CONNECTION

Implement:

* Connect to existing Chrome instance:
  ws://localhost:9222

* Expose:

```ts
connect(): Promise<Browser>
getPage(): Promise<Page>
```

* Handle:

  * connection failure
  * reconnect logic
  * multiple pages

---

## 🧩 PHASE 2 — SDK INTERFACE

Expose:

```ts
sdk.execute({
  action: "click" | "type" | "navigate",
  target: string,
  value?: string
})
```

---

## 🧩 PHASE 3 — SELECTOR ENGINE

Support:

* css selectors
* text=Login (exact)
* text*=Log (partial)

Convert → CSS/XPath usable by Puppeteer

---

## 🧩 PHASE 4 — RELIABILITY LAYER (CRITICAL)

Implement:

1. Auto-wait:

   * wait for element presence
   * wait for visibility

2. Retry:

   * configurable retries
   * exponential backoff

3. Actionability checks:

   * element attached
   * visible
   * interactable

---

## 🧩 PHASE 5 — GOVERNANCE

Implement:

* domain whitelist
* block execution on non-approved sites

---

## 🧩 PHASE 6 — TRACING

* log every action:

  * action type
  * selector
  * timestamp
  * result (success/failure)

---

## 🧪 PHASE 7 — E2E TESTING (MANDATORY)

Create real E2E tests using Puppeteer.

---

### TEST 1: Background Execution

* Open page
* Switch to another tab (simulate)
* Execute SDK action
* Verify result

---

### TEST 2: Retry Stability

* Use delayed element
* Ensure SDK succeeds

---

### TEST 3: Selector Intelligence

* Use text selectors
* Verify correct element clicked

---

### TEST 4: Multi-step Flow

* Navigate
* Type
* Click
* Validate outcome

---

## 🚨 TEST EXECUTION REQUIREMENT

Tests MUST run using:

npm run test:e2e

---

## 🚨 PRODUCTION REQUIREMENTS

* TypeScript strict mode
* No any types
* Proper error handling (no silent failures)
* Modular design
* No hardcoded values
* Clean separation of concerns

---

## 🚨 RELIABILITY REQUIREMENT

System MUST be:

* deterministic
* repeatable
* stable on dynamic pages

Aim for reliability equal to or better than Playwright.

---

## 🚨 DO NOT DO

* No placeholder code
* No mock implementations
* No partial features
* No skipping error handling

---

## ✅ FINAL OUTPUT

* Complete folder structure
* Fully working SDK
* E2E tests passing
* Ready for integration into extension later

---
