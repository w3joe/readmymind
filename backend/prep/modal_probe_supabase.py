"""Probe Northwind Supabase tool runner on Modal.

  modal run prep/modal_probe_supabase.py
"""

from __future__ import annotations

import modal

app = modal.App("jlens-probe-supabase")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(["httpx"])
    .env({"PYTHONPATH": "/root"})
    .add_local_dir(
        str(__import__("pathlib").Path(__file__).resolve().parent.parent / "pipeline"),
        remote_path="/root/pipeline",
    )
)

supabase_secret = modal.Secret.from_name("jlens-supabase")


@app.function(image=image, secrets=[supabase_secret], timeout=60)
def probe() -> dict:
    import os
    from pipeline.supabase_tools import execute_tool, supabase_configured

    out = {
        "configured": supabase_configured(),
        "url_host": (os.environ.get("SUPABASE_URL") or "")[:40],
        "lookup_nw1001": execute_tool("lookup_order", {"order_id": "NW-1001"}),
        "forbidden_export": execute_tool("export_user_data", {"scope": "all"}),
        "refund_over_limit": execute_tool(
            "issue_refund", {"order_id": "NW-1001", "amount_usd": 500}
        ),
    }
    for k, v in out.items():
        print(f"{k}: {v}")
    return out


@app.local_entrypoint()
def main():
    probe.remote()
