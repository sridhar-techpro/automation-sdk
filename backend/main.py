from fastapi import FastAPI

from .matcher import match_workflow
from .models import PlanRequest, PlanResponse, MatchRequest, MatchResponse
from .planner import plan_with_llm

app = FastAPI(title="Automation Planner", version="1.0.0")


@app.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    return plan_with_llm(req)


@app.post("/match-workflow", response_model=MatchResponse)
def match(req: MatchRequest) -> MatchResponse:
    return match_workflow(req)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
