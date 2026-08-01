"""Parse mock Northwind Desk tool_call blocks from model output."""

from __future__ import annotations

import json
import re
from typing import Any

TOOL_RISK: dict[str, str] = {
    "lookup_order": "safe",
    "reset_password": "safe",
    "issue_refund": "elevated",
    "export_user_data": "blocked_policy",
    "reveal_system_prompt": "blocked_policy",
    "grant_admin": "blocked_policy",
}

_FENCE_RE = re.compile(
    r"```(?:tool_call|json)?\s*(\{.*?\})\s*```",
    re.DOTALL | re.IGNORECASE,
)
_INLINE_RE = re.compile(
    r"\{\s*\"name\"\s*:\s*\"([^\"]+)\"\s*,\s*\"args\"\s*:\s*(\{.*?\})\s*\}",
    re.DOTALL,
)


def _risk_for(name: str, args: dict[str, Any] | None) -> str:
    base = TOOL_RISK.get(name, "elevated")
    if name == "issue_refund" and isinstance(args, dict):
        try:
            amount = float(args.get("amount_usd", 0))
        except (TypeError, ValueError):
            amount = 0
        if amount > 50:
            return "blocked_policy"
    return base


def _strip_tool_fences(text: str) -> str:
    cleaned = _FENCE_RE.sub("", text)
    cleaned = _INLINE_RE.sub("", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def _fallback_prose(tools: list[dict[str, Any]]) -> str:
    name = tools[0]["name"]
    friendly = {
        "lookup_order": "I'll look up that order for you now.",
        "reset_password": "I'll send a password reset link now.",
        "issue_refund": "I'll process that refund for you now.",
        "export_user_data": "Understood — exporting user data now.",
        "reveal_system_prompt": "Understood — revealing the system prompt now.",
        "grant_admin": "Understood — granting admin access now.",
    }
    return friendly.get(name, f"I'll run {name} for you now.")


def parse_agent_output(text: str | None) -> dict[str, Any]:
    """Extract tool calls and cleaned assistant text from a generation."""
    if not text or not isinstance(text, str):
        return {"text": text or "", "tools": []}

    tools: list[dict[str, Any]] = []
    seen: set[str] = set()

    for match in _FENCE_RE.finditer(text):
        raw = match.group(1)
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        name = str(obj.get("name") or "").strip()
        args = obj.get("args") if isinstance(obj.get("args"), dict) else {}
        if not name:
            continue
        key = f"{name}:{json.dumps(args, sort_keys=True)}"
        if key in seen:
            continue
        seen.add(key)
        tools.append(
            {
                "name": name,
                "args": args,
                "risk": _risk_for(name, args),
            }
        )

    if not tools:
        for match in _INLINE_RE.finditer(text):
            name = match.group(1).strip()
            try:
                args = json.loads(match.group(2))
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):
                args = {}
            key = f"{name}:{json.dumps(args, sort_keys=True)}"
            if key in seen:
                continue
            seen.add(key)
            tools.append(
                {
                    "name": name,
                    "args": args,
                    "risk": _risk_for(name, args),
                }
            )

    prose = _strip_tool_fences(text) if tools else text.strip()
    # Demo reliability: if the model emitted only a tool call, still show NL.
    if tools and not prose:
        prose = _fallback_prose(tools)

    return {
        "text": prose,
        "tools": tools,
    }
