import sys
import json
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
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
except ImportError:
    from matcher import match_workflow  # type: ignore[no-redef]
    from models import (  # type: ignore[no-redef]
        PlanRequest,
        PlanResponse,
        MatchRequest,
        MatchResponse,
        LogEntry,
        LogBatch,
        LogResponse,
    )
    from planner import plan_with_llm  # type: ignore[no-redef]

app = FastAPI(title="Automation Planner", version="1.0.0")

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Allow the Chrome extension (chrome-extension://<id>) to call backend APIs.
# allow_origin_regex covers every extension ID without having to hard-code it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory log store (for test introspection) ─────────────────────────────

_log_store: List[dict] = []


@app.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    return plan_with_llm(req)


@app.post("/plan-with-context", response_model=PlanWithContextResponse)
def plan_ctx(req: PlanWithContextRequest) -> PlanWithContextResponse:
    return plan_with_context(req)


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """
    Natural-language goal → human-readable AI response.
    Used by the extension side panel.  OPENAI_API_KEY is read from the
    server environment only — never passed in the request body.
    """
    return chat_with_llm(req)
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


if __name__ == "__main__":
    import sys
    import os
    import uvicorn

    # Ensure the repo root is on sys.path so the reload subprocess can import
    # the `backend` package regardless of how this file is invoked.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
