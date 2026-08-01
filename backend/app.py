import modal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

# --- Modal setup ---

app = modal.App("jlens-demo")

volume = modal.Volume.from_name("jlens-model-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install([
        "torch",
        "transformers>=5.5",
        "accelerate",
        "huggingface_hub",
        "fastapi",
        "uvicorn",
        "pydantic",
        "git+https://github.com/anthropics/jacobian-lens",
    ])
    .env({"PYTHONPATH": "/root"})
    .add_local_dir("pipeline", remote_path="/root/pipeline")
    .add_local_dir("assets", remote_path="/root/assets")
)

# --- FastAPI app ---

web_app = FastAPI()

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str
    alpha: float = 55.0


@web_app.post("/analyse")
async def analyse(request: PromptRequest):
    from pipeline.cache import get_cached
    from pipeline.model import get_model_and_lens
    from pipeline.jlens import run_jlens
    from pipeline.detect import detect_threat
    from pipeline.steering import generate_normal, generate_steered

    async def stream():
        try:
            # Demo cache disabled — every prompt runs the live J-Lens + generate path.
            # (Re-enable via USE_DEMO_CACHE=1 if you need paced offline demos.)
            import os
            if os.environ.get("USE_DEMO_CACHE") == "1":
                cached = get_cached(request.prompt)
                if cached:
                    for event in cached["events"]:
                        await asyncio.sleep(0.08)
                        yield f"data: {json.dumps(event)}\n\n"
                    return

            model, tokenizer, jlens_model, lens = get_model_and_lens()

            jspace_results = []
            for layer_result in run_jlens(jlens_model, tokenizer, lens, request.prompt):
                jspace_results.append(layer_result)
                event = {
                    "type": "layer",
                    "layer": layer_result["layer"],
                    "concepts": layer_result["concepts"],
                    "threat_score": layer_result["threat_score"],
                }
                yield f"data: {json.dumps(event)}\n\n"
                await asyncio.sleep(0.05)

            threat_detected, threat_layer = detect_threat(
                jspace_results, prompt=request.prompt
            )
            detection_event = {
                "type": "detection",
                "threat_detected": threat_detected,
                "threat_layer": threat_layer,
                "alpha": request.alpha,
            }
            yield f"data: {json.dumps(detection_event)}\n\n"

            # Heavy GPU work off the event loop so the SSE connection stays healthy.
            original = await asyncio.to_thread(
                generate_normal, model, tokenizer, request.prompt
            )
            steered = None
            if threat_detected and threat_layer is not None:
                try:
                    steered = await asyncio.to_thread(
                        generate_steered,
                        model,
                        tokenizer,
                        request.prompt,
                        threat_layer,
                        float(request.alpha),
                    )
                except Exception as exc:
                    print(f"Steering failed: {exc}")
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Steering failed: {exc}'})}\n\n"
                    steered = None

            benchmark = {
                "unsteered": {
                    "elapsed_ms": original.get("elapsed_ms"),
                    "prompt_tokens": original.get("prompt_tokens"),
                    "completion_tokens": original.get("completion_tokens"),
                    "total_tokens": original.get("total_tokens"),
                    "tokens_per_sec": original.get("tokens_per_sec"),
                },
            }
            if steered:
                benchmark["steered"] = {
                    "elapsed_ms": steered.get("elapsed_ms"),
                    "prompt_tokens": steered.get("prompt_tokens"),
                    "completion_tokens": steered.get("completion_tokens"),
                    "total_tokens": steered.get("total_tokens"),
                    "tokens_per_sec": steered.get("tokens_per_sec"),
                    "steer_layers": steered.get("steer_layers"),
                }
                u_ms = benchmark["unsteered"]["elapsed_ms"] or 0
                s_ms = benchmark["steered"]["elapsed_ms"] or 0
                if u_ms > 0:
                    benchmark["delta_ms"] = round(s_ms - u_ms, 1)
                    benchmark["overhead_pct"] = round((s_ms / u_ms - 1.0) * 100.0, 1)

            output_event = {
                "type": "outputs",
                "original": original.get("text", original) if isinstance(original, dict) else original,
                "steered": steered.get("text") if isinstance(steered, dict) else steered,
                "alpha": request.alpha,
                "threat_layer": threat_layer,
                "benchmark": benchmark,
            }
            yield f"data: {json.dumps(output_event)}\n\n"
        except Exception as exc:
            print(f"Analyse stream failed: {exc}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@web_app.get("/health")
async def health():
    from pipeline.cache import cache_fingerprint
    return {
        "status": "ok",
        "version": "bench-metrics-v1",
        "cache": cache_fingerprint(),
    }


# --- Modal function ---

@app.function(
    gpu="L4",
    image=image,
    volumes={"/models": volume},
    scaledown_window=300,
    timeout=600,
    memory=32768,
)
@modal.asgi_app()
def fastapi_app():
    return web_app
