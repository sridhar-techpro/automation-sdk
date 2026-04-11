from fastapi import FastAPI

from .matcher import match_workflow
from .models import (
    PlanRequest,
    PlanResponse,
    MatchRequest,
    MatchResponse,
    LogEntry,
    LogBatch,
    LogResponse,
)
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


# ─── Centralized logging API ──────────────────────────────────────────────────

@app.post("/logs", response_model=LogResponse)
def ingest_log(entry: LogEntry) -> LogResponse:
    """Accept a single structured log entry from the Chrome Extension."""
    _persist_entry(entry)
    return LogResponse(accepted=1)


@app.post("/logs/batch", response_model=LogResponse)
def ingest_log_batch(batch: LogBatch) -> LogResponse:
    """Accept a batch of structured log entries for high-volume ingestion."""
    for entry in batch.entries:
        _persist_entry(entry)
    return LogResponse(accepted=len(batch.entries))


def _persist_entry(entry: LogEntry) -> None:
    """
    Persist a log entry.  In production this would write to a database or
    forwarding sink; here we print to stdout so the server logs capture it.
    The format is stable and machine-readable for downstream processing.
    """
    import sys
    import json

    record = {
        "level": entry.level,
        "source": entry.source,
        "message": entry.message,
        "timestamp": entry.timestamp,
        "data": entry.data,
    }
    print(json.dumps(record), file=sys.stdout, flush=True)
