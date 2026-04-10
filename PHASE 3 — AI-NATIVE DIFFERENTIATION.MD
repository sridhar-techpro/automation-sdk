# 🚀 TASK: Add AI-Native Intelligence to Automation SDK

---

## 🎯 OBJECTIVE

Enhance SDK with memory, semantic understanding, and intelligent execution.

This is NOT part of Puppeteer or Playwright.

---

## 🧩 FEATURES TO IMPLEMENT

---

### 1. SEMANTIC SELECTOR RESOLUTION

Support:

```ts
sdk.execute({
  action: "click",
  target: "Login button"
})
```

* map natural language → DOM element
* use heuristics (text, role, attributes)

---

### 2. WORKFLOW MEMORY

Store executed tasks:

* steps
* selectors
* outcomes

---

### 3. TASK REPLAY

If similar task detected:

* skip selector resolution
* reuse stored steps
* execute directly

---

### 4. SIMILARITY MATCHING (BASIC)

* simple keyword matching (no external ML required)
* match previous workflows

---

### 5. EXECUTION OPTIMIZATION

* reduce steps
* skip redundant waits
* improve speed on repeat tasks

---

### 6. FAILURE RECOVERY

If step fails:

* try alternative selector
* fallback strategies

---

## 🧪 TEST REQUIREMENTS

---

### Test 1: Memory Replay

* execute task once
* execute again
* ensure faster execution

---

### Test 2: Semantic Execution

* use natural language target
* verify correct element selected

---

### Test 3: Failure Recovery

* simulate broken selector
* ensure recovery works

---

## 🚨 REQUIREMENTS

* Keep system deterministic
* No external APIs required
* All logic local

---

## 🚨 GOAL

Build AI-native automation system that improves over time.

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
