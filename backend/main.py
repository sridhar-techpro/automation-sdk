import sys
import json
import os
from typing import List
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .models import (
        LogEntry,
        LogBatch,
        LogResponse,
        LlmRequest,
        LlmResponse,
    )
except ImportError:
    from models import (  # type: ignore[no-redef]
        LogEntry,
        LogBatch,
        LogResponse,
        LlmRequest,
        LlmResponse,
    )

app = FastAPI(title="Automation Backend", version="1.0.0")

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


# ─── LLM proxy ────────────────────────────────────────────────────────────────

def _mock_llm(req: LlmRequest) -> LlmResponse:
    """Deterministic mock for /llm when OPENAI_API_KEY is not set."""
    lower = req.prompt.lower()

    if "steps" in lower or "planner" in lower or "browser steps" in lower:
        return LlmResponse(response=json.dumps({
            "steps": [
                {"action": "navigate", "target": "https://www.amazon.in/s?k=smartphones", "description": "Navigate to Amazon search"},
                {"action": "wait",     "target": "body", "description": "Wait for page load"},
                {"action": "extract",  "target": ".s-result-item", "description": "Extract product listings"},
            ]
        }))

    if "topproducts" in lower.replace(" ", "") or "reasoning" in lower:
        return LlmResponse(response=json.dumps({
            "topProducts": [
                {"name": "Redmi Note 13 Pro", "price": "17999", "rating": 4.4, "reviews": 2341, "inStock": True},
                {"name": "Samsung Galaxy A25 5G", "price": "19999", "rating": 4.3, "reviews": 1876, "inStock": True},
                {"name": "Realme Narzo 60", "price": "16999", "rating": 4.2, "reviews": 1543, "inStock": True},
            ],
            "reasoning": "Top 3 phones selected based on rating ≥ 4 and ≥ 500 reviews, all in stock."
        }))

    if "extract" in lower or "product" in lower:
        return LlmResponse(response=json.dumps([
            {"name": "Redmi Note 13 Pro", "price": "₹17,999", "rating": 4.4, "reviews": 2341, "inStock": True},
            {"name": "Samsung Galaxy A25 5G", "price": "₹19,999", "rating": 4.3, "reviews": 1876, "inStock": True},
            {"name": "Realme Narzo 60", "price": "₹16,999", "rating": 4.2, "reviews": 1543, "inStock": True},
        ]))

    return LlmResponse(response="Top recommendation: processed successfully.")


@app.post("/llm", response_model=LlmResponse)
def llm(req: LlmRequest) -> LlmResponse:
    """
    Thin LLM proxy — accepts a prompt, returns the model response.
    Used exclusively by the extension agent layer (planner, extractor, reasoner).
    OPENAI_API_KEY is read from the server environment only.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful automation assistant."},
                {"role": "user", "content": req.prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        return LlmResponse(response=resp.choices[0].message.content or "")
    return _mock_llm(req)


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
