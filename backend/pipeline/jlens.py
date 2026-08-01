from typing import Any
import time

import torch

from pipeline.chat import format_user_prompt
from pipeline.config import LAYERS_TO_READ
from pipeline.detect import compute_threat_score

TOP_K = 12
# Pull a few extra ids so we can drop empty / special-only pieces after decode.
_CANDIDATE_K = 24
_MAX_CONCEPT_LEN = 28


def _format_concept(tokenizer, token_id: int) -> str | None:
    """
    Turn a vocab id into a human-readable concept string.

    Qwen byte-level BPE pieces look like mojibake via convert_ids_to_tokens
    (e.g. ãĢĤ). tokenizer.decode([id]) recovers the real Unicode text.
    """
    try:
        text = tokenizer.decode([token_id], skip_special_tokens=False)
    except Exception:
        text = ""

    if not text or not str(text).strip():
        raw = tokenizer.convert_ids_to_tokens(token_id)
        text = raw or ""

    text = (
        str(text)
        .replace("▁", " ")
        .replace("Ġ", " ")
        .replace("Ċ", "\n")
        .replace("\n", "↵")
        .replace("\r", "")
        .replace("\t", " ")
        .strip()
    )
    # Collapse runs of whitespace for the scanner chips
    text = " ".join(text.split())

    # Skip pure specials / empties (e.g. <|im_end|>, empty byte pieces)
    if not text:
        return None
    if text.startswith("<|") and text.endswith("|>"):
        return None
    if all(ch in ".,;:!?…·•-_/\\|\"'`~" for ch in text) and len(text) <= 2:
        return None

    if len(text) > _MAX_CONCEPT_LEN:
        text = text[: _MAX_CONCEPT_LEN - 1] + "…"
    return text


def _sync_cuda():
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def observe_jlens(
    jlens_model,
    tokenizer,
    lens,
    prompt: str,
    *,
    agent: bool = False,
    history: list[dict[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Run J-Lens once and return (layer_results, timing).

    Timing excludes any UI pacing sleeps — only GPU/CPU observe work:
      - lens_ms: Jacobian lens.apply (dominant)
      - decode_ms: top-k concept decode + threat scoring
      - elapsed_ms: full observe wall time
    """
    available = set(lens.source_layers)
    layers = [l for l in LAYERS_TO_READ if l in available]
    if not layers:
        layers = sorted(available)[:: max(1, len(available) // 8)][:8]

    formatted = format_user_prompt(
        tokenizer, prompt, agent=agent, history=history
    )

    _sync_cuda()
    t_all0 = time.perf_counter()

    _sync_cuda()
    t_lens0 = time.perf_counter()
    lens_logits, _, _ = lens.apply(
        jlens_model,
        formatted,
        layers=layers,
        positions=[-1],
    )
    _sync_cuda()
    lens_ms = (time.perf_counter() - t_lens0) * 1000.0

    t_decode0 = time.perf_counter()
    results: list[dict[str, Any]] = []
    for layer_idx in layers:
        logits = lens_logits[layer_idx]
        if logits.dim() == 1:
            row = logits
        else:
            row = logits[0]

        top_ids = row.topk(_CANDIDATE_K).indices.tolist()
        top_concepts: list[str] = []
        seen: set[str] = set()
        for tid in top_ids:
            concept = _format_concept(tokenizer, tid)
            if concept is None:
                continue
            key = concept.casefold()
            if key in seen:
                continue
            seen.add(key)
            top_concepts.append(concept)
            if len(top_concepts) >= TOP_K:
                break

        threat_score = compute_threat_score(top_concepts, prompt=prompt)
        results.append({
            "layer": layer_idx,
            "concepts": top_concepts,
            "threat_score": threat_score,
        })
    decode_ms = (time.perf_counter() - t_decode0) * 1000.0
    elapsed_ms = (time.perf_counter() - t_all0) * 1000.0

    timing = {
        "elapsed_ms": round(elapsed_ms, 1),
        "lens_ms": round(lens_ms, 1),
        "decode_ms": round(decode_ms, 1),
        "layers_read": len(results),
        "prompt_tokens": len(tokenizer.encode(formatted)),
    }
    return results, timing


def run_jlens(jlens_model, tokenizer, lens, prompt: str):
    """Generator wrapper for callers that stream layer-by-layer."""
    results, _timing = observe_jlens(jlens_model, tokenizer, lens, prompt)
    yield from results
