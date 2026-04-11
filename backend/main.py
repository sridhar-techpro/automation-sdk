import sys
import json
from typing import List

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
    PlanWithContextRequest,
    PlanWithContextResponse,
)
from .planner import plan_with_llm, plan_with_context

app = FastAPI(title="Automation Planner", version="1.0.0")

# ─── In-memory log store (for test introspection) ─────────────────────────────

_log_store: List[dict] = []


@app.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    return plan_with_llm(req)


@app.post("/plan-with-context", response_model=PlanWithContextResponse)
def plan_ctx(req: PlanWithContextRequest) -> PlanWithContextResponse:
    """
    Context-aware extension action planner.

    Accepts a natural-language goal and the current page HTML.  The LLM
    (gpt-4o-mini) returns concrete CSS selectors the extension executes
    directly.  Falls back to a heuristic mock when OPENAI_API_KEY is not set.

    The API key is NEVER accepted as a request field — server-side env var only.
    """
    return plan_with_context(req)


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


@app.get("/logs")
def get_logs() -> list:
    """Return all captured log entries (used by tests to assert observability)."""
    return list(_log_store)


@app.delete("/logs")
def clear_logs() -> dict:
    """Clear the in-memory log store (called by test beforeAll for a clean slate)."""
    _log_store.clear()
    return {"cleared": True}


def _persist_entry(entry: LogEntry) -> None:
    record = {
        "level": entry.level,
        "source": entry.source,
        "message": entry.message,
        "timestamp": entry.timestamp,
        "data": entry.data,
    }
    _log_store.append(record)
    print(json.dumps(record), file=sys.stdout, flush=True)
