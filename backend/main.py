from fastapi import FastAPI

from .models import PlanRequest, PlanResponse
from .planner import plan_with_llm

app = FastAPI(title="Automation Planner", version="1.0.0")


@app.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    return plan_with_llm(req)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
