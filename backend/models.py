from pydantic import BaseModel
from typing import Any


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
