# 🚀 TASK: Enhance Automation SDK with Locator System + Advanced Execution (Production-Grade)

---

## 🧠 ROLE

You are extending a **production-grade Automation SDK**.

The SDK already supports:

* CDP-based execution using puppeteer-core
* retry + wait + actionability
* selector engine (css + text)
* E2E tested reliability

Your job is to enhance it to near Playwright-level capabilities WITHOUT breaking existing behavior.

---

## 🎯 OBJECTIVE

Introduce:

* Locator system (Playwright-inspired)
* Advanced selector handling
* CSS + XPath execution layer
* Frame + shadow DOM support
* Multi-tab orchestration

---

## 🏗️ ARCHITECTURE (STRICT)

SDK (locator + selector + reliability)
↓
Execution Engine (CSS/XPath → Puppeteer Core via CDP)
↓
Browser

---

## 🚨 CRITICAL: PUPPETEER USAGE RULE

This project MUST use **puppeteer-core ONLY**.

DO NOT:

* install "puppeteer"
* use puppeteer.launch()
* download Chromium
* create new browser instances

ALWAYS:

* use puppeteer-core
* connect via:
  puppeteerCore.connect({ browserWSEndpoint })

---

## 🚨 CRITICAL: CDP EXECUTION RULE

All automation MUST run on an already running browser.

DO NOT:

* manage browser lifecycle
* spawn new browsers
* assume isolation

This SDK must remain compatible with future Chrome extension (chrome.debugger).

---

## 🚨 HARD CONSTRAINTS

* DO NOT rewrite Phase 1 code
* DO NOT break existing tests
* DO NOT add heavy dependencies
* DO NOT bypass SDK abstraction layer

---

# 🧩 PART 1 — LOCATOR SYSTEM (CORE)

---

## Implement:

```ts
sdk.locator(selector)
```

Returns a Locator object.

---

## Locator API (MANDATORY)

```ts
locator.click()
locator.type(value)
locator.nth(index)
locator.first()
locator.last()
locator.filter({ hasText?: string })
locator.locator(childSelector)
```

---

## Requirements:

* Lazy evaluation (resolve at execution time)
* Chainable API
* Integrated with retry + wait
* Works for CSS, XPath, text, and advanced selectors

---

# 🧩 PART 2 — ADVANCED SELECTORS

---

## Add support for:

* getByRole(role, { name })
* getByLabel(text)
* getByPlaceholder(text)
* getByTestId(id)
* getByText(text) (enhance existing)

---

## Implementation rules:

* Convert internally → CSS/XPath
* Integrate into existing selector engine
* Reuse retry + wait

---

# 🧩 PART 3 — SELECTOR EXECUTION ENGINE

---

## Implement:

```ts
resolveSelector(selector): {
  type: "css" | "xpath"
  value: string
}
```

---

## Execution Rules:

### CSS:

* use page.$ / waitForSelector

### XPath:

* use page.$x / evaluate

---

## Must Support:

* auto detection (css vs xpath)
* fallback if selector fails
* compatibility with locator system

---

# 🧩 PART 4 — FRAME SUPPORT

---

## Implement:

```ts
sdk.frame(selector).locator(...).click()
```

---

## Requirements:

* support nested iframes
* maintain frame context
* safe fallback if frame missing

---

# 🧩 PART 5 — SHADOW DOM SUPPORT

---

Enhance selector engine to:

* traverse shadow roots recursively
* support nested shadow DOM

---

# 🧩 PART 6 — MULTI-TAB MANAGEMENT

---

Implement:

```ts
sdk.getTabs()
sdk.switchToTab(index)
sdk.executeOnTab(index, action)
```

---

## Requirements:

* track all pages
* execute on background tabs
* maintain context safely

---

# 🧩 PART 7 — ENHANCED ACTIONABILITY

---

Extend checks:

* visible
* stable (no layout shift)
* enabled
* not covered

Must integrate with retry

---

# 🧩 PART 8 — SCREENSHOT SUPPORT

---

```ts
sdk.screenshot()
locator.screenshot()
```

---

# 🧩 PART 9 — TRACING IMPROVEMENT

---

Enhance logs:

* step timeline
* selector resolution path
* failure context

---

# 🧪 TEST REQUIREMENTS (MANDATORY)

---

## Test Group 1: Locator System

* chaining
* nth / first / last
* filter({ hasText })

---

## Test Group 2: Selector Execution

* CSS execution
* XPath execution
* fallback behavior

---

## Test Group 3: Frame Handling

* iframe interaction
* nested iframe

---

## Test Group 4: Shadow DOM

* shadow root interaction

---

## Test Group 5: Multi-Tab

* switch tabs
* execute on background tab

---

## Test Group 6: Advanced Selectors

* getByRole
* getByLabel
* getByPlaceholder
* getByTestId

---

# 🚨 RELIABILITY REQUIREMENTS

* No flaky tests
* Must pass all Phase 1 tests unchanged
* Deterministic execution

---

# 🚨 EXECUTION STRATEGY

1. Build Locator class
2. Extend selector engine
3. Add CSS/XPath execution
4. Add frame + shadow support
5. Add multi-tab management
6. Add tests and validate

---

# 🚨 SUCCESS CRITERIA

* All Phase 1 tests pass
* All Phase 2 tests pass
* No regressions
* Clean architecture maintained

---

# 🚀 FINAL GOAL

Achieve near Playwright-level capability while maintaining:

* CDP-based execution
* extension compatibility
* production-grade reliability

---

🚨 TOOLING & PACKAGE CONSTRAINTS (STRICT)
Package Manager
MUST use: pnpm
DO NOT use: npm, yarn
Commands

Use ONLY:

pnpm install
pnpm build
pnpm test
pnpm test:e2e
pnpm validate
DO NOT:
run npm install
run npm run build
generate package-lock.json
Dependencies
MUST use: puppeteer-core
DO NOT use: puppeteer
Browser Model
MUST connect via CDP:
puppeteer-core.connect()
MUST NOT:
use puppeteer.launch() for SDK execution
spawn new Chromium instances for production logic
Exception (Testing Only)
puppeteer MAY be used in devDependencies ONLY for E2E tests
MUST NOT be used in SDK runtime
Build System
MUST respect existing package.json
MUST NOT override scripts
MUST integrate with current build pipeline
Validation Requirement

All scripts MUST work with:

pnpm build
pnpm test:e2e
pnpm validate
Failure Condition

If any code:

uses npm
uses puppeteer incorrectly
breaks pnpm workflow

👉 It is considered INVALID and must be corrected
Before implementation, analyze package.json and existing scripts. Do not introduce npm usage anywhere.
