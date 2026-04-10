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
