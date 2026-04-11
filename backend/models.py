from pydantic import BaseModel
from typing import Any, Literal


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


# ─── LLM proxy models (used by extension agent layer) ─────────────────────────

class LlmRequest(BaseModel):
    """Request body for /llm — a raw prompt string."""
    prompt: str


class LlmResponse(BaseModel):
    """Response from /llm — the raw model response string."""
    response: str
