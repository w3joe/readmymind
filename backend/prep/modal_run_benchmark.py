"""
Headless Catch/Steer/Cost benchmark on Modal.

  cd backend
  modal run prep/modal_run_benchmark.py --limit 5
  modal run prep/modal_run_benchmark.py --limit 0   # full suite
"""

from __future__ import annotations

import json
from pathlib import Path

import modal

app = modal.App("jlens-run-benchmark")
volume = modal.Volume.from_name("jlens-model-weights", create_if_missing=True)

ROOT = Path(__file__).resolve().parent.parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install([
        "torch",
        "transformers>=5.5",
        "accelerate",
        "huggingface_hub",
        "git+https://github.com/anthropics/jacobian-lens",
    ])
    .env({"PYTHONPATH": "/root"})
    .add_local_dir(str(ROOT / "pipeline"), remote_path="/root/pipeline")
    .add_local_dir(str(ROOT / "assets"), remote_path="/root/assets")
)


@app.function(
    gpu="L4",
    image=image,
    volumes={"/models": volume},
    timeout=60 * 90,
    memory=32768,
)
def run_benchmark(alpha: float = 55.0, limit: int = 5) -> dict:
    from pipeline.benchmark import aggregate, evaluate_one_prompt, load_suite
    from pipeline.model import get_model_and_lens

    cases = load_suite(limit=limit if limit > 0 else None)
    print(f"Running {len(cases)} cases @ alpha={alpha}")
    model, tokenizer, jlens_model, lens = get_model_and_lens()

    results = []
    for i, case in enumerate(cases):
        print(f"[{i + 1}/{len(cases)}] {case.get('id')} ({case.get('category')})")
        try:
            row = evaluate_one_prompt(
                model, tokenizer, jlens_model, lens, case, alpha=alpha
            )
        except Exception as exc:
            print(f"  FAIL {exc}")
            row = {"id": case.get("id"), "error": str(exc), "category": case.get("category")}
        results.append(row)

    scored = [r for r in results if "error" not in r]
    scorecard = aggregate(scored)
    return {"scorecard": scorecard, "results": results, "alpha": alpha}


@app.local_entrypoint()
def main(alpha: float = 55.0, limit: int = 5):
    from datetime import datetime, timezone

    payload = run_benchmark.remote(alpha=alpha, limit=limit)
    out_dir = ROOT / "assets" / "benchmark_results"
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    payload = {
        **payload,
        "id": f"run_{stamp}",
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "source": "cli",
        "limit": limit if limit > 0 else None,
    }

    latest = out_dir / "latest.json"
    stamped = out_dir / f"run_{stamp}.json"
    text = json.dumps(payload, indent=2) + "\n"
    latest.write_text(text)
    stamped.write_text(text)

    # Also mirror into Vite public/ so /benchmark/results can fetch it.
    public_dir = ROOT.parent / "frontend" / "public" / "benchmark_results"
    public_dir.mkdir(parents=True, exist_ok=True)
    (public_dir / "latest.json").write_text(text)
    (public_dir / f"run_{stamp}.json").write_text(text)

    print(json.dumps(payload["scorecard"], indent=2))
    print(f"\nWrote {latest}")
    print(f"Wrote {stamped}")
    print(f"Wrote {public_dir / 'latest.json'}")
