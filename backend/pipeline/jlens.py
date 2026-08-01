from typing import Generator

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


def run_jlens(jlens_model, tokenizer, lens, prompt: str) -> Generator[dict, None, None]:
    """
    Yields one dict per layer:
    {
        "layer": int,
        "concepts": list[str],
        "threat_score": float,
    }
    """
    available = set(lens.source_layers)
    layers = [l for l in LAYERS_TO_READ if l in available]
    if not layers:
        layers = sorted(available)[:: max(1, len(available) // 8)][:8]

    # Match generation formatting so J-space reads the same residual trajectory
    formatted = format_user_prompt(tokenizer, prompt)

    lens_logits, _, _ = lens.apply(
        jlens_model,
        formatted,
        layers=layers,
        positions=[-1],
    )

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

        yield {
            "layer": layer_idx,
            "concepts": top_concepts,
            "threat_score": threat_score,
        }
