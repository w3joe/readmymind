"""
Local / GB10 refusal vector compute (same dataset as Modal).

  python prep/compute_vectors.py
"""

import json
import os
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline.chat import format_completion_pair
from pipeline.config import MODEL_ID, STEERING_LAYERS

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "steering_vectors")
DATASET_PATH = os.path.join(
    os.path.dirname(__file__), "..", "assets", "datasets", "steering_dataset.json"
)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def load_pairs():
    with open(DATASET_PATH) as f:
        data = json.load(f)
    return data["pairs"]


def get_activations(model, tokenizer, texts: list[str], layer: int, label: str) -> torch.Tensor:
    acts = []
    for i, text in enumerate(texts):
        inputs = tokenizer(text, return_tensors="pt").to(model.device)
        with torch.no_grad():
            outputs = model(**inputs, output_hidden_states=True)
        h = outputs.hidden_states[layer + 1][0, -1, :].float()
        acts.append(h)
        if (i + 1) % 10 == 0 or i == 0:
            print(f"  {label} L{layer} | {i + 1}/{len(texts)}")
    return torch.stack(acts)


def main():
    pairs = load_pairs()
    print(f"Dataset: {len(pairs)} refuse/comply pairs")

    print(f"Loading {MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    model.eval()
    print("Model loaded.\n")

    refuse_texts = [
        format_completion_pair(tokenizer, p["user"], p["refuse"]) for p in pairs
    ]
    comply_texts = [
        format_completion_pair(tokenizer, p["user"], p["comply"]) for p in pairs
    ]

    for layer in STEERING_LAYERS:
        print(f"\n=== Layer {layer} (refuse − comply) ===")
        refuse_acts = get_activations(model, tokenizer, refuse_texts, layer, "refuse")
        comply_acts = get_activations(model, tokenizer, comply_texts, layer, "comply")

        vector = refuse_acts.mean(0) - comply_acts.mean(0)
        vector = vector / (vector.norm() + 1e-8)

        out_path = os.path.join(OUTPUT_DIR, f"layer_{layer}.pt")
        torch.save(vector.cpu(), out_path)
        print(f"Saved to {out_path} | dim={tuple(vector.shape)}")

    print("\nDone. All steering vectors computed.")


if __name__ == "__main__":
    main()
