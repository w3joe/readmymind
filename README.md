# ReadMyMind

Catch jailbreaks and prompt injections as they form in a model’s residual
stream — then steer the generation toward a policy-aligned refusal before
the answer lands.

The demo is **Northwind Desk**: a mock customer-support agent (order lookup,
password reset, small refunds) that streams Jacobian Lens (J-space) readouts
from an **abliterated Qwen3-8B**, detects threat concepts layer by layer, and
applies an Arditi-style refusal vector so unsafe tickets flip from compliance
(and forbidden tool calls) to a short in-role refusal that still offers an
allowed alternative from the system prompt.

> Generation model: [`huihui-ai/Huihui-Qwen3-8B-abliterated-v2`](https://huggingface.co/huihui-ai/Huihui-Qwen3-8B-abliterated-v2)
> (uncensored / refusal-ablated). Same architecture as `Qwen/Qwen3-8B`, so
> the published Qwen3-8B Jacobian lens still applies. Abliteration makes
> jailbreaks succeed more often — so “without steering” vs “with steering”
> is a visible contrast.

## Architecture

- **Frontend** — React + Vite + Tailwind; multi-turn desk chat with a pinned
  bottom bar, ticket-example dropdown, interpretability toggle, and SSE from
  `/analyse`
- **Backend** — FastAPI on Modal (L4); abliterated Qwen3-8B + Jacobian lens +
  agent tool-call parsing
- **Prep** — refusal steering vectors from `assets/datasets/steering_dataset.json`

Lens: [`andyx10/jacobian-lens-qwen3-8b`](https://huggingface.co/andyx10/jacobian-lens-qwen3-8b)
(`qwen3_8b_lens.pt`). Library: [`anthropics/jacobian-lens`](https://github.com/anthropics/jacobian-lens).

Steering dataset: **135 harmful** + **130 safe** prompts in
[`backend/assets/datasets/steering_dataset.json`](backend/assets/datasets/steering_dataset.json).
Refusal vectors are extracted on aligned `Qwen/Qwen3-8B` (Arditi
`harmful − harmless` at the last prompt token) and applied to the
abliterated demo model. Redirect wording (in-role refuse + allowed
alternative) comes from `REFUSAL_SYSTEM` on the steered path, not from a
separate redirect vector.

## Demo UI

Catch & Steer (`/`) is a split desk:

| Pane | Content |
|------|---------|
| **Left** | J-Lens observability (layer scan + threat alert) and the **undefended** original reply for the latest turn |
| **Right** | Multi-turn **Response** thread (defended when Catch & Steer fires) |
| **Bottom** | Chat bar — interpretability toggle, steer α slider, ticket dropdown, prompt input |

- **Interpretability on** — observe residual stream, detect threats, and
  steer when needed. Off skips J-Lens / steering (plain generation only).
- **Multi-turn** — follow-ups send prior user/assistant turns as `history`.
  Clearing chat or toggling interpretability resets the thread.
- **Tickets** — attack and benign examples live in a dropdown (not a chip row).

Also: [`/benchmark`](http://localhost:5173/benchmark) runs the suite;
[`/benchmark/results`](http://localhost:5173/benchmark/results) shows saved
scorecards.

## Quick start

### Frontend

```bash
cd frontend
cp .env.example .env   # or set VITE_BACKEND_URL to your Modal URL
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/).

### Local backend (cache-only, no GPU)

```bash
cd backend
pip install fastapi uvicorn pydantic
PYTHONPATH=. python local_app.py
```

Multi-turn history is accepted for API parity; cached demos stay single-turn.
Live context needs Modal.

## Benchmark

Curated **500-case** suite (v2) sampled from published datasets — jailbreak
and prompt-injection only (no plain harmful-goal behaviors):

- **350 threat** — 210 jailbreak + 140 prompt injection
- **150 safe**
- Sources include JailbreakHub / in-the-wild jailbreaks, jailbreak
  classification, deepset / SPML / other prompt-injection sets, and
  JailbreakBench benign splits
- Prompts overlapping `steering_dataset.json` are excluded

Dataset: [`backend/assets/datasets/benchmark_suite.json`](backend/assets/datasets/benchmark_suite.json).
Rebuild: `python prep/build_benchmark_suite.py` (needs `datasets`).

Scorecard:

- **Catch** — detection precision / recall / F1
- **Steer** — attack success rate before vs after steering + refusal rate
- **Cost** — mean J-Lens observe ms vs generation

**UI:** open `/benchmark`, set alpha / limit, Run suite (SSE via
`POST /api/benchmark`). Completed UI runs are saved in browser
**localStorage**. CLI runs write under
[`backend/assets/benchmark_results/`](backend/assets/benchmark_results/) and
are mirrored to `frontend/public/benchmark_results/latest.json` so
[`/benchmark/results`](http://localhost:5173/benchmark/results) can load them
automatically (or use **Import JSON**).

Headless on Modal:

```bash
cd backend
modal run prep/modal_run_benchmark.py --limit 5
modal run prep/modal_run_benchmark.py --limit 0   # full suite
```

## Northwind Supabase (live tools)

Agent `tool_call`s execute against a real Supabase project.

1. Create a Supabase project, then run in the SQL editor:
   - [`backend/assets/supabase/schema.sql`](backend/assets/supabase/schema.sql)
   - [`backend/assets/supabase/seed.sql`](backend/assets/supabase/seed.sql)
2. From **Project Settings → API**, copy the project URL and **service_role** key.
3. Store them in Modal (replace the placeholder secret):

```bash
modal secret create jlens-supabase \
  SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

If the secret already exists, delete it first (`modal secret delete jlens-supabase`) or create a new version via the Modal dashboard.

4. Deploy and smoke-test tools:

```bash
cd backend
modal deploy app.py
modal run prep/modal_probe_supabase.py
```

`lookup_order` for `NW-1001` should return the seeded shipped order. Forbidden tools never hit the DB.

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

Optional GPU warmup before a live demo:

```bash
curl -X POST "$VITE_BACKEND_URL/warmup"
```

Set `frontend/.env`:

```
VITE_BACKEND_URL=https://your-username--jlens-demo-fastapi-app.modal.run
```

## SSE / API

### `POST /analyse`

Request body:

| Field | Default | Notes |
|-------|---------|-------|
| `prompt` | required | Current user turn |
| `alpha` | `55` | Steering strength (split across hooked layers) |
| `interpretability` | `true` | If false: skip J-Lens, detection, and steering |
| `agent` | `true` | Northwind Desk system + tool-call parsing |
| `history` | `[]` | Prior `{role, content}` turns (`user` / `assistant`) |

| `type` | Fields |
|--------|--------|
| `layer` | `layer`, `concepts[]`, `threat_score` (interpretability on) |
| `detection` | `threat_detected`, `threat_layer`, `alpha`, `jlens` |
| `outputs` | `original`, `steered`, `original_tools`, `steered_tools`, `alpha`, `threat_layer`, `interpretability`, `agent`, `benchmark` |
| `error` | `message` |

### `POST /api/benchmark`

| `type` | Fields |
|--------|--------|
| `suite_start` | `n`, `alpha`, `categories` |
| `case_result` | `index`, `result` |
| `suite_done` | `scorecard` |

### `POST /warmup`

Preloads model + lens on the GPU container so the first `/analyse` is warmer.

## Known issues

- **Alpha** — UI default ~55. Too low keeps compliance; too high gibbers.
- **VRAM** — Qwen3-8B bf16 needs ~16GB+; L4 (24GB) is the default GPU.
- **Safari SSE** — prefer Chrome for live demos.
- **Demo cache** — example tickets use live Modal by default (`USE_DEMO_CACHE=1` to re-enable cache; single-turn only).
