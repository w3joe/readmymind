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
from pydantic import BaseModel, Field

from pipeline.cache import get_cached

web_app = FastAPI()

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: str
    content: str


class PromptRequest(BaseModel):
    prompt: str
    history: list[ChatTurn] = Field(default_factory=list)


@web_app.post("/analyse")
async def analyse(request: PromptRequest):
    async def stream():
        # Multi-turn history is accepted for API parity; cache demos are single-turn only.
        if not request.history:
            cached = get_cached(request.prompt)
            if cached:
                for event in cached["events"]:
                    await asyncio.sleep(0.08)
                    yield f"data: {json.dumps(event)}\n\n"
                return

        # No live model on local_app — tell the client
        yield f"data: {json.dumps({'type': 'detection', 'threat_detected': False, 'threat_layer': None})}\n\n"
        note = (
            "(multi-turn — run on Modal for live context)"
            if request.history
            else "(uncached prompt — run on Modal or populate demo_cache.json)"
        )
        yield f"data: {json.dumps({'type': 'outputs', 'original': note, 'steered': None, 'original_tools': [], 'steered_tools': []})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@web_app.get("/health")
async def health():
    return {"status": "ok", "mode": "cache-only"}


if __name__ == "__main__":
    uvicorn.run("local_app:web_app", host="0.0.0.0", port=8000, reload=True)
