import json
import os

from models import LlmRequest, LlmResponse


# ─── Thin LLM proxy (used by extension agent layer via POST /llm) ─────────────

def llm_proxy(req: LlmRequest) -> LlmResponse:
    """
    Accepts a raw prompt and returns the LLM response.
    Used by the extension agent layer (planner, extractor, reasoner).

    With OPENAI_API_KEY → calls gpt-4o-mini.
    Without it           → deterministic mock based on prompt content.
    Key is read from server environment only — never from the request.
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
