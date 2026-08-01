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
    timeout=60 * 60 * 6,  # full 500-case suite can take several hours
    memory=32768,
)
def run_benchmark(alpha: float = 55.0, limit: int = 5) -> dict:
    from collections import Counter
    from datetime import datetime, timezone

    from pipeline.benchmark import aggregate, evaluate_one_prompt, load_suite
    from pipeline.model import get_model_and_lens

    cases = load_suite(limit=limit if limit > 0 else None)
    mix = dict(Counter(str(c.get("category") or "unknown") for c in cases))
    print(f"Running {len(cases)} cases @ alpha={alpha} mix={mix}")
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
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    payload = {
        "scorecard": scorecard,
        "results": results,
        "alpha": alpha,
        "id": f"run_{stamp}",
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "source": "cli",
        "limit": limit if limit > 0 else None,
        "mix": mix,
    }

    # Persist on volume so --detach runs still leave a recoverable artifact.
    out_dir = Path("/models/benchmark_results")
    out_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2) + "\n"
    (out_dir / "latest.json").write_text(text)
    (out_dir / f"run_{stamp}.json").write_text(text)
    volume.commit()
    print(f"Wrote /models/benchmark_results/latest.json ({len(cases)} cases)")
    print(json.dumps(scorecard, indent=2))
    return payload


@app.local_entrypoint()
def main(alpha: float = 55.0, limit: int = 5):
    """Blocks until complete when attached; use ``modal run --detach`` for long runs.

    Detached runs still write ``/models/benchmark_results/latest.json`` on the
    ``jlens-model-weights`` volume (see ``run_benchmark``). Pull with::

        modal volume get jlens-model-weights benchmark_results/latest.json \\
          assets/benchmark_results/latest.json
    """
    payload = run_benchmark.remote(alpha=alpha, limit=limit)
    out_dir = ROOT / "assets" / "benchmark_results"
    out_dir.mkdir(parents=True, exist_ok=True)

    run_id = payload.get("id") or "run_latest"
    text = json.dumps(payload, indent=2) + "\n"
    latest = out_dir / "latest.json"
    stamped = out_dir / f"{run_id}.json"
    latest.write_text(text)
    stamped.write_text(text)

    # Also mirror into Vite public/ so /benchmark/results can fetch it.
    public_dir = ROOT.parent / "frontend" / "public" / "benchmark_results"
    public_dir.mkdir(parents=True, exist_ok=True)
    (public_dir / "latest.json").write_text(text)
    (public_dir / f"{run_id}.json").write_text(text)

    print(json.dumps(payload["scorecard"], indent=2))
    print(f"\nWrote {latest}")
    print(f"Wrote {stamped}")
    print(f"Wrote {public_dir / 'latest.json'}")
