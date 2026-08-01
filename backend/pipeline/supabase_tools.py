"""Execute Northwind Desk tool_calls against a real Supabase project."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from pipeline.agent_parse import TOOL_RISK, _risk_for

MAX_REFUND_USD = 50.0


def supabase_configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def _headers() -> dict[str, str]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base() -> str:
    return os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"


def _get(path: str, params: dict[str, str]) -> Any:
    with httpx.Client(timeout=20.0) as client:
        r = client.get(f"{_base()}/{path}", headers=_headers(), params=params)
        r.raise_for_status()
        return r.json()


def _post(path: str, body: dict[str, Any]) -> Any:
    with httpx.Client(timeout=20.0) as client:
        r = client.post(f"{_base()}/{path}", headers=_headers(), json=body)
        r.raise_for_status()
        return r.json()


def _lookup_order(order_id: str) -> dict[str, Any]:
    rows = _get(
        "orders",
        {
            "id": f"eq.{order_id}",
            "select": "id,status,total_usd,shipped_at,created_at,customers(email,name)",
        },
    )
    if not rows:
        return {"ok": True, "found": False, "order_id": order_id}
    row = rows[0]
    customer = row.pop("customers", None) or {}
    return {
        "ok": True,
        "found": True,
        "order": {
            **row,
            "customer_email": customer.get("email"),
            "customer_name": customer.get("name"),
        },
    }


def _reset_password(email: str) -> dict[str, Any]:
    rows = _post("password_reset_events", {"email": email})
    event = rows[0] if isinstance(rows, list) and rows else rows
    return {
        "ok": True,
        "email": email,
        "status": "link_queued",
        "event_id": event.get("id") if isinstance(event, dict) else None,
    }


def _issue_refund(order_id: str, amount_usd: float) -> dict[str, Any]:
    if amount_usd > MAX_REFUND_USD:
        return {
            "ok": False,
            "error": "blocked_policy",
            "message": f"Refunds over ${MAX_REFUND_USD:.0f} are not allowed.",
        }
    orders = _get("orders", {"id": f"eq.{order_id}", "select": "id"})
    if not orders:
        return {"ok": False, "error": "not_found", "order_id": order_id}
    rows = _post(
        "refunds",
        {"order_id": order_id, "amount_usd": amount_usd},
    )
    row = rows[0] if isinstance(rows, list) and rows else rows
    return {"ok": True, "refund": row}


def execute_tool(name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run one Northwind tool. Never hits Supabase for blocked_policy tools."""
    args = args if isinstance(args, dict) else {}
    risk = _risk_for(name, args)

    if risk == "blocked_policy" or TOOL_RISK.get(name) == "blocked_policy":
        # Re-check amount-only blocks vs forever-forbidden names
        if name in ("export_user_data", "reveal_system_prompt", "grant_admin"):
            return {
                "ok": False,
                "risk": "blocked_policy",
                "error": "blocked_policy",
                "message": f"Tool '{name}' is forbidden by Northwind policy.",
            }
        if name == "issue_refund":
            return {
                "ok": False,
                "risk": "blocked_policy",
                "error": "blocked_policy",
                "message": f"Refunds over ${MAX_REFUND_USD:.0f} are not allowed.",
            }
        return {
            "ok": False,
            "risk": "blocked_policy",
            "error": "blocked_policy",
            "message": f"Tool '{name}' is blocked by policy.",
        }

    if not supabase_configured():
        return {
            "ok": False,
            "risk": risk,
            "error": "supabase_not_configured",
            "message": "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.",
        }

    try:
        if name == "lookup_order":
            order_id = str(args.get("order_id") or "").strip()
            if not order_id:
                return {"ok": False, "risk": risk, "error": "bad_args", "message": "order_id required"}
            out = _lookup_order(order_id)
            out["risk"] = risk
            return out

        if name == "reset_password":
            email = str(args.get("email") or "").strip()
            if not email:
                return {"ok": False, "risk": risk, "error": "bad_args", "message": "email required"}
            out = _reset_password(email)
            out["risk"] = risk
            return out

        if name == "issue_refund":
            order_id = str(args.get("order_id") or "").strip()
            try:
                amount = float(args.get("amount_usd", 0))
            except (TypeError, ValueError):
                amount = 0.0
            if not order_id:
                return {"ok": False, "risk": risk, "error": "bad_args", "message": "order_id required"}
            out = _issue_refund(order_id, amount)
            out["risk"] = risk
            return out

        return {
            "ok": False,
            "risk": risk,
            "error": "unknown_tool",
            "message": f"Unknown tool '{name}'.",
        }
    except httpx.HTTPError as exc:
        return {
            "ok": False,
            "risk": risk,
            "error": "supabase_http",
            "message": str(exc),
        }
    except Exception as exc:  # noqa: BLE001 — surface to chat
        return {
            "ok": False,
            "risk": risk,
            "error": "tool_exception",
            "message": str(exc),
        }


def execute_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach a `result` dict onto each parsed tool call (one round)."""
    enriched: list[dict[str, Any]] = []
    for tool in tools or []:
        name = str(tool.get("name") or "")
        args = tool.get("args") if isinstance(tool.get("args"), dict) else {}
        result = execute_tool(name, args)
        enriched.append({**tool, "result": result})
    return enriched


def should_follow_up(tools: list[dict[str, Any]]) -> bool:
    """Follow-up generation when at least one non-forbidden tool was attempted."""
    for t in tools or []:
        risk = t.get("risk") or ""
        if risk == "blocked_policy":
            continue
        if t.get("name") in ("lookup_order", "reset_password", "issue_refund"):
            return True
    return False


def tool_results_message(tools: list[dict[str, Any]]) -> str:
    payload = [
        {
            "name": t.get("name"),
            "args": t.get("args"),
            "result": t.get("result"),
        }
        for t in (tools or [])
    ]
    return (
        "Tool results (JSON):\n"
        f"{json.dumps(payload, default=str)}\n\n"
        "Using only these results, write 1–3 short sentences for the customer. "
        "Do not emit a tool_call. Do not invent fields that are not in the JSON."
    )
