import json
import os

from .models import (
    PlanRequest,
    PlanResponse,
    PlanStep,
    PlanWithContextRequest,
    PlanWithContextResponse,
    ExtensionActionStep,
)


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


# ─── Context-aware extension planning ────────────────────────────────────────

def plan_with_context(req: PlanWithContextRequest) -> PlanWithContextResponse:
    """
    Plans extension actions given a goal and the page HTML.

    Returns concrete CSS selectors / URLs — not intent-level descriptions —
    so the Chrome Extension can execute the steps directly.

    Uses OpenAI (gpt-4o-mini) when OPENAI_API_KEY is set in the environment;
    falls back to a heuristic mock plan when the key is absent.

    The API key is NEVER accepted as a request parameter — it is read
    exclusively from the server-side environment variable.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return _llm_plan_with_context(req, api_key)
    return _mock_plan_with_context(req)


def _llm_plan_with_context(
    req: PlanWithContextRequest, api_key: str
) -> PlanWithContextResponse:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    system = (
        "You are an extension action planner that produces executable CSS selectors. "
        "Given a natural-language goal and the page HTML, return ONLY a JSON object:\n"
        '{"reasoning": "<one-sentence summary>", '
        '"steps": [{"action": "click"|"type"|"navigate"|"screenshot", '
        '"target": "<css-selector-or-url>", '
        '"value": "<text — only for type actions>", '
        '"reasoning": "<why this selector>"}]}\n'
        "Prefer specific selectors: #id > [data-*] > [aria-label] > .class > tag. "
        "Output ONLY the JSON — no markdown fences, no commentary."
    )

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"Goal: {req.goal}\n\n"
                    f"Page HTML (first 3000 chars):\n{req.pageHtml[:3_000]}"
                ),
            },
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )

    data = json.loads(resp.choices[0].message.content)
    return PlanWithContextResponse(
        reasoning=data.get("reasoning", ""),
        steps=[ExtensionActionStep(**s) for s in data.get("steps", [])],
    )


def _mock_plan_with_context(req: PlanWithContextRequest) -> PlanWithContextResponse:
    """
    Heuristic mock used when OPENAI_API_KEY is not set.
    Inspects the goal text and falls back to safe, common selectors.
    """
    goal_lower = req.goal.lower()

    if "click" in goal_lower and "button" in goal_lower:
        return PlanWithContextResponse(
            reasoning="Goal mentions clicking a button; targeting #btn by id.",
            steps=[
                ExtensionActionStep(
                    action="click",
                    target="#btn",
                    reasoning="Most specific button id on the page",
                )
            ],
        )

    if "type" in goal_lower or "input" in goal_lower or "enter" in goal_lower:
        return PlanWithContextResponse(
            reasoning="Goal mentions typing into an input field.",
            steps=[
                ExtensionActionStep(
                    action="type",
                    target="#inp",
                    value="test input",
                    reasoning="First text input on the page",
                )
            ],
        )

    # Default: click the first button on the page
    return PlanWithContextResponse(
        reasoning="No specific pattern detected; defaulting to first button.",
        steps=[
            ExtensionActionStep(
                action="click",
                target="button",
                reasoning="Generic fallback — first button element",
            )
        ],
    )

