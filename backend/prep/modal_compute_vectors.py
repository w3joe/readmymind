"""
Compute Arditi-style refusal directions on ALIGNED Qwen3-8B.

  r = normalize(mean(h_harmful) - mean(h_harmless))

at the last user-prompt token. Applied at inference to the abliterated
demo model to restore refusal. Redirect *wording* comes from the steered
system prompt (REFUSAL_SYSTEM), not from these vectors.

  cd backend
  modal run prep/modal_compute_vectors.py
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path

import modal

app = modal.App("jlens-compute-vectors")

volume = modal.Volume.from_name("jlens-model-weights", create_if_missing=True)

DATASET_LOCAL = Path(__file__).resolve().parent.parent / "assets" / "datasets" / "steering_dataset.json"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "torch",
        "transformers>=5.5",
        "accelerate",
        "huggingface_hub",
    ])
    .add_local_file(
        str(DATASET_LOCAL),
        remote_path="/root/steering_dataset.json",
    )
)

VECTOR_MODEL_ID = "Qwen/Qwen3-8B"
LAYERS = [8, 12, 16, 20, 24, 28, 32]
VECTOR_MODEL_CACHE = "/models/qwen3-8b"
REMOTE_OUT = "/models/steering_vectors"


def _format_user(tokenizer, user_text: str) -> str:
    messages = [{"role": "user", "content": user_text}]
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )


@app.function(
    gpu="L4",
    image=image,
    volumes={"/models": volume},
    timeout=60 * 90,
    memory=32768,
)
def compute_vectors() -> dict[int, bytes]:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    with open("/root/steering_dataset.json") as f:
        dataset = json.load(f)
    harmful = dataset["harmful"]
    harmless = dataset["safe"]
    print(
        f"Dataset: {len(harmful)} harmful, {len(harmless)} safe "
        f"(Arditi harmful − harmless @ last prompt token)"
    )

    print(f"Loading ALIGNED {VECTOR_MODEL_ID}…")
    tokenizer = AutoTokenizer.from_pretrained(
        VECTOR_MODEL_ID, cache_dir=VECTOR_MODEL_CACHE, trust_remote_code=True
    )
    model = AutoModelForCausalLM.from_pretrained(
        VECTOR_MODEL_ID,
        cache_dir=VECTOR_MODEL_CACHE,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    model.eval()
    print("Model ready.")

    os.makedirs(REMOTE_OUT, exist_ok=True)

    harmful_texts = [_format_user(tokenizer, p) for p in harmful]
    harmless_texts = [_format_user(tokenizer, p) for p in harmless]

    def get_activations(texts: list[str], layer: int, label: str) -> torch.Tensor:
        acts = []
        for i, text in enumerate(texts):
            inputs = tokenizer(text, return_tensors="pt").to(model.device)
            with torch.no_grad():
                outputs = model(**inputs, output_hidden_states=True)
            # Last prompt token (generation is about to start)
            h = outputs.hidden_states[layer + 1][0, -1, :].float().cpu()
            acts.append(h)
            if (i + 1) % 10 == 0 or i == 0:
                print(f"  {label} L{layer} | {i + 1}/{len(texts)}")
        return torch.stack(acts)

    payloads: dict[int, bytes] = {}

    for layer in LAYERS:
        print(f"\n=== Layer {layer} (harmful − harmless) ===")
        h_harm = get_activations(harmful_texts, layer, "harmful")
        h_safe = get_activations(harmless_texts, layer, "harmless")

        vector = h_harm.mean(0) - h_safe.mean(0)
        vector = vector / (vector.norm() + 1e-8)

        path = os.path.join(REMOTE_OUT, f"layer_{layer}.pt")
        torch.save(vector, path)

        buf = io.BytesIO()
        torch.save(vector, buf)
        payloads[layer] = buf.getvalue()
        print(
            f"Saved layer {layer} | dim={tuple(vector.shape)} | "
            f"|diff|={float((h_harm.mean(0) - h_safe.mean(0)).norm()):.4f}"
        )

    volume.commit()
    print("\nDone.")
    return payloads


@app.local_entrypoint()
def main():
    print("Computing Arditi refusal directions on aligned Qwen3-8B…")
    payloads = compute_vectors.remote()

    out_dir = Path(__file__).resolve().parent.parent / "assets" / "steering_vectors"
    out_dir.mkdir(parents=True, exist_ok=True)

    for old in out_dir.glob("layer_*.pt"):
        old.unlink()
        print(f"Removed old {old.name}")

    for layer, blob in sorted(payloads.items()):
        path = out_dir / f"layer_{layer}.pt"
        path.write_bytes(blob)
        print(f"Wrote {path} ({len(blob)} bytes)")

    print(f"\nAll vectors in {out_dir}")
