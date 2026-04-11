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


# ─── Logging models ──────────────────────────────────────────────────────────

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
