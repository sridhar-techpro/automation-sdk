import json
import os

from models import MatchRequest, MatchResponse


def match_workflow(req: MatchRequest) -> MatchResponse:
    """Uses LLM when OPENAI_API_KEY is set; otherwise uses keyword scoring."""
    if not req.candidates:
        return MatchResponse(workflowId=None, confidence=0.0)

    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return _llm_match(req, api_key)
    return _keyword_match(req)


def _keyword_match(req: MatchRequest) -> MatchResponse:
    goal_tokens = set(req.goal.lower().split())
    best_id = None
    best_score = 0.0
    for candidate in req.candidates:
        cand_tokens = set(candidate.goal.lower().split())
        if not goal_tokens and not cand_tokens:
            continue
        intersection = goal_tokens & cand_tokens
        union = goal_tokens | cand_tokens
        score = len(intersection) / len(union) if union else 0.0
        if score > best_score:
            best_score = score
            best_id = candidate.id
    return MatchResponse(workflowId=best_id, confidence=best_score)


def _llm_match(req: MatchRequest, api_key: str) -> MatchResponse:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    candidates_json = json.dumps([{"id": c.id, "goal": c.goal} for c in req.candidates])
    system = (
        "You are matching user intent to existing workflows. "
        "Return the best matching workflow ID and confidence score (0-1). "
        "Only return JSON: {\"workflowId\": \"...\", \"confidence\": 0.0}. "
        "If no good match exists, return {\"workflowId\": null, \"confidence\": 0.0}."
    )
    user = f"Goal: {req.goal}\nCandidates: {candidates_json}"
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content)
    return MatchResponse(
        workflowId=data.get("workflowId"),
        confidence=float(data.get("confidence", 0.0)),
    )
