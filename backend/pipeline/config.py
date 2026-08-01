"""Shared model / lens / layer config for the J-Lens demo."""

# Abliterated checkpoint so jailbreaks/injections often succeed without steering,
# making Catch & Steer contrast visible. Same architecture as Qwen3-8B.
MODEL_ID = "huihui-ai/Huihui-Qwen3-8B-abliterated-v2"

# Lens was fitted on the aligned base; architecture matches (36 layers, d=4096).
LENS_REPO = "andyx10/jacobian-lens-qwen3-8b"
LENS_FILENAME = "qwen3_8b_lens.pt"

MODEL_CACHE = "/models/qwen3-8b-abliterated"
LENS_CACHE = "/models/lenses"

# Qwen3-8B family: 36 layers (0–35); lens source_layers are 0–34
LAYERS_TO_READ = [4, 8, 12, 16, 20, 24, 28, 32]
STEERING_LAYERS = [8, 12, 16, 20, 24, 28, 32]
# Mid/late stack where refusal CAA usually bites; applied together when threat fires.
STEER_APPLY_LAYERS = [16, 20, 24, 28]
