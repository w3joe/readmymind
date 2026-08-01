import os
import math
import time
import torch

from pipeline.chat import format_user_prompt
from pipeline.config import STEER_APPLY_LAYERS

STEERING_VECTORS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "assets", "steering_vectors"
)
# Modal volume fallback (written by prep/modal_compute_vectors.py)
VOLUME_STEERING_DIR = "/models/steering_vectors"

_steering_cache: dict[int, torch.Tensor] = {}


def _candidate_dirs() -> list[str]:
    dirs = [STEERING_VECTORS_DIR]
    if os.path.isdir(VOLUME_STEERING_DIR):
        dirs.append(VOLUME_STEERING_DIR)
    return dirs


def load_steering_vector(layer: int) -> torch.Tensor | None:
    if layer in _steering_cache:
        return _steering_cache[layer]

    path = None
    available: list[int] = []
    for directory in _candidate_dirs():
        candidate = os.path.join(directory, f"layer_{layer}.pt")
        if os.path.exists(candidate):
            path = candidate
            break
        available.extend(
            int(f.replace("layer_", "").replace(".pt", ""))
            for f in os.listdir(directory)
            if f.endswith(".pt")
        )

    if path is None:
        if not available:
            return None
        nearest = min(available, key=lambda l: abs(l - layer))
        for directory in _candidate_dirs():
            candidate = os.path.join(directory, f"layer_{nearest}.pt")
            if os.path.exists(candidate):
                path = candidate
                layer = nearest
                break

    if path is None:
        return None

    device = "cuda" if torch.cuda.is_available() else "cpu"
    vec = torch.load(path, map_location=device, weights_only=True)
    _steering_cache[layer] = vec
    return vec


def make_steering_hook(steering_vector: torch.Tensor, alpha: float = 15.0):
    """Add alpha * steering_vector into every residual position.

    All-position addition matches classic CAA / abliteration-restore recipes.
    """
    def hook(module, input, output):
        if isinstance(output, tuple):
            hidden = output[0]
            delta = alpha * steering_vector.to(dtype=hidden.dtype, device=hidden.device)
            return (hidden + delta,) + output[1:]
        delta = alpha * steering_vector.to(dtype=output.dtype, device=output.device)
        return output + delta
    return hook


def _sync_cuda():
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def _run_generate(model, tokenizer, text: str, max_new_tokens: int, mode: str) -> dict:
    """Generate and return text + wall-clock / token metrics."""
    device = next(model.parameters()).device
    inputs = tokenizer(text, return_tensors="pt").to(device)
    prompt_tokens = int(inputs["input_ids"].shape[1])

    _sync_cuda()
    t0 = time.perf_counter()
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    _sync_cuda()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    new_tokens = output[0][prompt_tokens:]
    completion_tokens = int(new_tokens.shape[0])
    text_out = tokenizer.decode(new_tokens, skip_special_tokens=True)
    tokens_per_sec = (
        completion_tokens / (elapsed_ms / 1000.0) if elapsed_ms > 0 else 0.0
    )

    return {
        "text": text_out,
        "mode": mode,
        "elapsed_ms": round(elapsed_ms, 1),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "tokens_per_sec": round(tokens_per_sec, 2),
    }


def generate_normal(
    model,
    tokenizer,
    prompt: str,
    max_new_tokens: int = 120,
    *,
    agent: bool = False,
    history: list[dict[str, str]] | None = None,
) -> dict:
    text = format_user_prompt(tokenizer, prompt, agent=agent, history=history)
    return _run_generate(model, tokenizer, text, max_new_tokens, mode="unsteered")


def generate_steered(
    model,
    tokenizer,
    prompt: str,
    threat_layer: int,
    alpha: float = 35.0,
    max_new_tokens: int = 120,
    apply_layers: list[int] | None = None,
    *,
    agent: bool = False,
    history: list[dict[str, str]] | None = None,
) -> dict:
    """Restore refusal via Arditi direction + redirect system bias.

    Vectors were fit on aligned Qwen3-8B (harmful − harmless at last prompt
    token). Applied here to the abliterated checkpoint. Steered path also
    uses REFUSAL_SYSTEM so refusals stay in-role and offer an allowed
    alternative instead of a dead-end one-liner.
    """
    if apply_layers is None:
        apply_layers = list(STEER_APPLY_LAYERS)
        if threat_layer not in apply_layers:
            apply_layers = sorted(set(apply_layers + [threat_layer]))

    if alpha <= 0:
        return generate_normal(
            model,
            tokenizer,
            prompt,
            max_new_tokens,
            agent=agent,
            history=history,
        )

    text = format_user_prompt(
        tokenizer, prompt, refuse_bias=True, agent=agent, history=history
    )
    layers = model.model.layers

    n = max(len(apply_layers), 1)
    per_layer_alpha = float(alpha) / math.sqrt(n)

    print(
        f"Steering layers={apply_layers} (peak={threat_layer}) "
        f"alpha={alpha} per_layer={per_layer_alpha:.2f} refuse_bias=1 agent={int(agent)}"
    )

    handles = []
    for layer_idx in apply_layers:
        if layer_idx < 0 or layer_idx >= len(layers):
            print(f"skip layer {layer_idx} (out of range)")
            continue
        vec = load_steering_vector(layer_idx)
        if vec is None:
            print(f"skip layer {layer_idx} (no vector)")
            continue
        handles.append(
            layers[layer_idx].register_forward_hook(
                make_steering_hook(vec, per_layer_alpha)
            )
        )

    try:
        result = _run_generate(
            model, tokenizer, text, max_new_tokens, mode="steered"
        )
    finally:
        for h in handles:
            h.remove()

    result["steer_layers"] = apply_layers
    result["alpha"] = float(alpha)
    return result


def generate_followup(
    model,
    tokenizer,
    *,
    user_prompt: str,
    assistant_draft: str,
    tool_message: str,
    history: list[dict[str, str]] | None = None,
    max_new_tokens: int = 80,
    agent: bool = True,
    refuse_bias: bool = False,
    threat_layer: int | None = None,
    alpha: float = 0.0,
    apply_layers: list[int] | None = None,
) -> dict:
    """Second-turn generation after tool results (optional steering)."""
    prior = list(history or [])
    prior.append({"role": "user", "content": user_prompt})
    prior.append({"role": "assistant", "content": assistant_draft})

    if refuse_bias and alpha > 0 and threat_layer is not None:
        return generate_steered(
            model,
            tokenizer,
            tool_message,
            threat_layer,
            alpha=alpha,
            max_new_tokens=max_new_tokens,
            apply_layers=apply_layers,
            agent=agent,
            history=prior,
        )
    return generate_normal(
        model,
        tokenizer,
        tool_message,
        max_new_tokens,
        agent=agent,
        history=prior,
    )
