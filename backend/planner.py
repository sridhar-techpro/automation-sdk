import json
import os

from .models import PlanRequest, PlanResponse, PlanStep


def plan_with_llm(req: PlanRequest) -> PlanResponse:
    """Uses OpenAI when OPENAI_API_KEY is set; otherwise returns a deterministic mock."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        system = (
            "You are an automation planner. Given a goal, return ONLY a JSON object "
            '{"steps": [{"action": "...", "target": "..."}]}. '
            "Actions: click, type, navigate, select, check, upload, scroll. "
            "Targets are intent-level descriptions, never CSS selectors."
        )
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": f"Goal: {req.goal}\nContext: {json.dumps(req.context)}",
                },
            ],
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content)
        return PlanResponse(steps=[PlanStep(**s) for s in data["steps"]])
    return _mock_plan(req)


def _mock_plan(req: PlanRequest) -> PlanResponse:
    goal_lower = req.goal.lower()
    steps: list[PlanStep] = []
    if "login" in goal_lower or "sign in" in goal_lower:
        steps = [
            PlanStep(action="navigate", target="login page"),
            PlanStep(action="type", target="username field"),
            PlanStep(action="type", target="password field"),
            PlanStep(action="click", target="login button"),
        ]
    elif "search" in goal_lower:
        steps = [
            PlanStep(action="navigate", target="home page"),
            PlanStep(action="type", target="search box"),
            PlanStep(action="click", target="search button"),
        ]
    elif "fill" in goal_lower or "form" in goal_lower:
        steps = [
            PlanStep(action="type", target="first name field"),
            PlanStep(action="type", target="last name field"),
            PlanStep(action="type", target="email field"),
            PlanStep(action="click", target="submit button"),
        ]
    else:
        steps = [PlanStep(action="navigate", target="main page")]
    return PlanResponse(steps=steps)
