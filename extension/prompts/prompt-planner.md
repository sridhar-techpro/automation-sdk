Convert user goal into executable browser steps.

Return JSON:

{
  "steps": [
    {
      "action": "navigate | click | type | extract | wait",
      "target": "...",
      "value": "...",
      "url": "...",
      "description": "..."
    }
  ]
}

Rules:
- break into atomic steps
- include waits
- include navigation
- include extraction
