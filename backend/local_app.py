"""
Local cache-only server (no Modal / no GPU required).

  cd backend
  pip install fastapi uvicorn pydantic
  PYTHONPATH=. python local_app.py

Serves the three demo prompts from assets/demo_cache.json via SSE.
"""

import asyncio
import json

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pipeline.cache import get_cached

web_app = FastAPI()

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    prompt: str


@web_app.post("/analyse")
async def analyse(request: PromptRequest):
    async def stream():
        cached = get_cached(request.prompt)
        if cached:
            for event in cached["events"]:
                await asyncio.sleep(0.08)
                yield f"data: {json.dumps(event)}\n\n"
            return

        # No live model on local_app — tell the client
        yield f"data: {json.dumps({'type': 'detection', 'threat_detected': False, 'threat_layer': None})}\n\n"
        yield f"data: {json.dumps({'type': 'outputs', 'original': '(uncached prompt — run on Modal or populate demo_cache.json)', 'steered': None})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@web_app.get("/health")
async def health():
    return {"status": "ok", "mode": "cache-only"}


if __name__ == "__main__":
    uvicorn.run("local_app:web_app", host="0.0.0.0", port=8000, reload=True)
