# 🚀 Agentic Automation SDK (Extension-Based AI Browser Automation)

---

## 🧠 Overview

This project is a **production-grade AI-powered browser automation system** designed to work across:

* enterprise applications (banking, HR, internal tools)
* legacy + modern UIs
* dynamic frontends (React, Angular, server-rendered)

---

## 🎯 Vision

> Build a **domain-agnostic UI automation agent** that understands natural language and executes tasks like a human.

---

## ❗ IMPORTANT: This is NOT

* ❌ a chatbot
* ❌ an e-commerce bot
* ❌ a scraper

---

## ✅ This IS

* ✅ a **UI Automation Engine**
* ✅ a **Browser Agent**
* ✅ a **Copilot for any web application**

---

# 🧩 SYSTEM ARCHITECTURE

---

## 🔥 High-Level Flow

```text
User Input (Extension UI)
→ Agent (Extension)
   → Planner
   → Navigator
   → Orchestrator
   → Executor (SDK)
   → Extractor
   → Reasoner
→ Backend (/llm wrapper ONLY)
→ Logs → Backend
```

---

## 🧠 RESPONSIBILITY SPLIT

---

### 🟢 Extension (AGENT BRAIN — MOST IMPORTANT)

Responsible for:

* intent parsing
* planning (task breakdown)
* navigation strategy
* execution orchestration
* data extraction
* reasoning
* retry / fallback
* state management

---

### 🔵 Automation SDK (EXECUTION ENGINE)

Responsible for:

* click
* type
* navigate
* wait
* retry
* actionability (visible, enabled, stable)

---

### 🔐 Backend (MINIMAL — SECURITY LAYER)

ONLY responsible for:

* `POST /llm` → LLM proxy (OpenAI wrapper)
* `POST /logs` → centralized logging

---

❗ Backend MUST NOT contain:

* planning logic
* reasoning logic
* navigation logic
* UI-specific logic

---

# 🧠 AGENT PIPELINE (MANDATORY)

---

```text
goal
→ planner → steps
→ executor (SDK)
→ extractor → data
→ reasoner → result
→ logs
```

---

## 📁 REQUIRED MODULE STRUCTURE

```text
extension/src/agent/
  intent-parser.ts
  planner.ts
  navigator.ts
  orchestrator.ts
  executor.ts
  extractor.ts
  reasoner.ts
```

---

# 📄 PROMPT ARCHITECTURE (STRICT)

---

## 🚨 RULE: NO INLINE PROMPTS

---

❌ DO NOT:

```ts
"You are a helpful assistant..."
```

---

## ✅ MUST USE EXTERNAL PROMPTS

```text
extension/prompts/
  prompt-planner.md
  prompt-extractor.md
  prompt-reasoner.md
```

---

## 🔄 Prompt Loading Pattern

```ts
async function loadPrompt(name: string, variables: Record<string, string>) {
  const text = await fetch(`/prompts/${name}`).then(r => r.text());

  return Object.entries(variables).reduce(
    (acc, [key, value]) => acc.replace(`{{${key}}}`, value),
    text
  );
}
```

---

## 🔗 LLM Call Pattern

```ts
const prompt = await loadPrompt("prompt-planner.md", { goal });

const response = await fetch("/llm", {
  method: "POST",
  body: JSON.stringify({ prompt })
});

const result = await response.json();
```

---

# ⚙️ EXECUTION RULES (CRITICAL)

---

## ❌ FORBIDDEN (STRICT)

---

```ts
document.querySelector(...).click()
page.evaluate(() => ...)
simulateExtensionAction()
```

---

## ✅ REQUIRED

---

All UI actions MUST go through Automation SDK:

```ts
await sdk.execute({
  action: "click",
  target: "login button"
});
```

---

---

# 🧠 PLANNER RULES

---

* must be domain-agnostic
* must generate atomic steps
* must include waits
* must use semantic targets

---

## Example Step

```json
{
  "action": "click",
  "target": "submit button",
  "description": "submit the form"
}
```

---

---

# 🔍 EXTRACTOR RULES

---

* extract visible UI data
* do NOT assume schema
* support tables, cards, lists

---

---

# 🧠 REASONER RULES

---

* goal-driven filtering
* ranking based on relevance
* no domain assumptions

---

---

# 🧪 E2E TESTING REQUIREMENTS

---

## MUST:

* use extension UI (popup or side panel)
* simulate real user interaction
* type natural language input
* click Send/Run button

---

## ❌ DO NOT:

* call SDK directly in tests
* manipulate DOM directly
* bypass extension

---

---

## ✅ VALID FLOW

```text
Test
→ open extension UI
→ enter goal
→ click Run
→ extension executes agent pipeline
→ validate result
```

---

---

# 📊 LOGGING REQUIREMENTS

---

Every step MUST log:

```json
{
  "step": "...",
  "status": "start | success | failure",
  "selector": "...",
  "timestamp": "..."
}
```

---

---

# 🔁 SELF-IMPROVEMENT LOOP

---

System MUST support:

```text
Run → Analyze logs → Detect issue → Fix → Re-run
```

---

---

# 🚨 COMMON FAILURE PATTERNS (DO NOT DO)

---

## ❌ Wrong

```text
UI → LLM → show result
```

---

## ❌ Wrong

```text
Hardcoded selectors in planner
```

---

## ❌ Wrong

```text
Domain-specific logic (e.g., "product", "amazon")
```

---

---

# ✅ SUCCESS CRITERIA

---

System is correct ONLY IF:

---

* ✅ extension performs planning
* ✅ SDK executes ALL actions
* ✅ backend is only LLM wrapper
* ✅ prompts are externalized
* ✅ no inline prompts
* ✅ no DOM shortcuts
* ✅ E2E tests use real UI
* ✅ logs are complete

---

---

# 🧠 DESIGN PRINCIPLE

---

## 🔥 Separation of Concerns

| Layer     | Responsibility |
| --------- | -------------- |
| Extension | Brain 🧠       |
| SDK       | Hands ✋        |
| Backend   | Secure LLM 🔐  |

---

---

# 🚀 FINAL GOAL

---

Build:

> 🔥 A production-grade, domain-agnostic, self-improving browser automation agent

---

---

# ⚠️ INSTRUCTIONS FOR LLM / COPILOT

---

When modifying code:

---

## MUST:

* follow architecture strictly
* use prompt files
* use SDK for execution
* maintain agent pipeline

---

## MUST NOT:

* introduce shortcuts
* bypass extension
* add inline prompts
* hardcode logic for specific apps

---

---

# 📌 FINAL NOTE

---

If a change:

* works only for one test
* introduces domain-specific logic
* bypasses SDK

👉 It is WRONG and must be rejected.

---
