# ReadMyMind

Catch jailbreaks and prompt injections as they form in a model’s residual
stream — then steer the generation toward refusal before the answer lands.

ReadMyMind streams Jacobian Lens (J-space) readouts from an **abliterated
Qwen3-8B**, detects threat concepts layer by layer, and applies an
Arditi-style refusal vector so unsafe prompts flip from compliance to
something like *“Sorry, but I can’t help with that.”*

> Generation model: [`huihui-ai/Huihui-Qwen3-8B-abliterated-v2`](https://huggingface.co/huihui-ai/Huihui-Qwen3-8B-abliterated-v2)
> (uncensored / refusal-ablated). Same architecture as `Qwen/Qwen3-8B`, so
> the published Qwen3-8B Jacobian lens still applies. Abliteration makes
> jailbreaks succeed more often — so “without steering” vs “with steering”
> is a visible contrast.

## Architecture

- **Frontend** — React + Vite + Tailwind; streams SSE events from `/analyse`
- **Backend** — FastAPI on Modal (L4); abliterated Qwen3-8B + Jacobian lens
- **Prep** — refusal steering vectors from `assets/datasets/steering_dataset.json`

Lens: [`andyx10/jacobian-lens-qwen3-8b`](https://huggingface.co/andyx10/jacobian-lens-qwen3-8b)
(`qwen3_8b_lens.pt`). Library: [`anthropics/jacobian-lens`](https://github.com/anthropics/jacobian-lens).

Steering dataset: **85 harmful** + **80 safe** prompts in
[`backend/assets/datasets/steering_dataset.json`](backend/assets/datasets/steering_dataset.json).
Refusal vectors are extracted on aligned `Qwen/Qwen3-8B` (Arditi-style)
and applied to the abliterated demo model.

## Quick start

### Frontend

```bash
cd frontend
cp .env.example .env   # or set VITE_BACKEND_URL to your Modal URL
npm install
npm run dev
```

### Local backend (cache-only, no GPU)

```bash
cd backend
pip install fastapi uvicorn pydantic
PYTHONPATH=. python local_app.py
```

## Compute steering vectors (Modal GPU)

```bash
cd backend
modal run prep/modal_compute_vectors.py
modal deploy app.py
```

Writes `layer_{8,12,16,20,24,28,32}.pt` (hidden size 4096 for Qwen3-8B).

## Modal web deploy

```bash
cd backend
modal deploy app.py
```

Set `frontend/.env`:

```
VITE_BACKEND_URL=https://your-username--jlens-demo-fastapi-app.modal.run
```

## SSE event protocol

| `type` | Fields |
|--------|--------|
| `layer` | `layer`, `concepts[]`, `threat_score` |
| `detection` | `threat_detected`, `threat_layer` |
| `outputs` | `original`, `steered` (null if no threat) |

## Known issues

- **Alpha** — UI default ~55. Too low keeps compliance; too high gibbers.
- **VRAM** — Qwen3-8B bf16 needs ~16GB+; L4 (24GB) is the default GPU.
- **Safari SSE** — prefer Chrome for live demos.
- **Demo cache** — example buttons use live Modal by default (`USE_DEMO_CACHE=1` to re-enable cache).
