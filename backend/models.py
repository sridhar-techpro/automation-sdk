from pydantic import BaseModel
from typing import Any, Literal


class PlanRequest(BaseModel):
    goal: str
    context: dict[str, Any] = {}


class PlanStep(BaseModel):
    action: str
    target: str


class PlanResponse(BaseModel):
    steps: list[PlanStep]


class WorkflowCandidate(BaseModel):
    id: str
    goal: str


class MatchRequest(BaseModel):
    goal: str
    candidates: list[WorkflowCandidate]


class MatchResponse(BaseModel):
    workflowId: str | None = None
    confidence: float = 0.0


# ─── Logging models ───────────────────────────────────────────────────────────

LogLevel = Literal["debug", "info", "warn", "error"]
LogSource = Literal["background", "content-script", "popup"]


class LogEntry(BaseModel):
    level: LogLevel
    source: LogSource
    message: str
    timestamp: int  # Unix ms
    data: dict[str, Any] = {}


class LogBatch(BaseModel):
    entries: list[LogEntry]


class LogResponse(BaseModel):
    accepted: int


# ─── Context-aware extension planning models ──────────────────────────────────

ExtensionAction = Literal["click", "type", "navigate", "screenshot"]


class ExtensionActionStep(BaseModel):
    """A concrete extension action with a CSS selector or URL target."""

    action: ExtensionAction
    target: str              # CSS selector (click/type/screenshot) or URL (navigate)
    value: str | None = None # text payload for "type" actions
    reasoning: str = ""      # one-line explanation from the LLM


class PlanWithContextRequest(BaseModel):
    """Request body for /plan-with-context."""

    goal: str
    pageHtml: str            # current page HTML; used by the LLM to pick selectors


class PlanWithContextResponse(BaseModel):
    """Response from /plan-with-context."""

    steps: list[ExtensionActionStep]
    reasoning: str = ""      # overall plan summary from the LLM


# ─── Natural-language chat models ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Request body for /chat — a free-form natural language goal."""
    goal: str


class ChatResponse(BaseModel):
    """Response from /chat — a human-readable AI answer."""
    response: str


# ─── LLM proxy models (used by extension agent layer) ─────────────────────────

class LlmRequest(BaseModel):
    """Request body for /llm — a raw prompt string."""
    prompt: str


class LlmResponse(BaseModel):
    """Response from /llm — the raw model response string."""
    response: str
