"""
review_routes.py - FastAPI routes for the review harness.

Import and include in server.py:
    from runner.review_routes import review_router, init_review
    app.include_router(review_router)
"""

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from .review import load_review_types, run_review, MAX_DOCUMENT_SIZE
from .extract import extract_text, SUPPORTED_EXTENSIONS

review_router = APIRouter(prefix="/api/review", tags=["review"])

# Injected by server.py via init_review()
_vendors = None
_review_types = None

# In-memory tracking of active reviews
_reviews: dict = {}

# Stale review threshold (seconds). Reviews older than this are
# garbage-collected when new reviews start.
_REVIEW_TTL = 600


def init_review(project_root: str, vendors: dict):
    """Called by server.py to inject shared config."""
    global _vendors, _review_types
    _vendors = vendors
    _review_types = load_review_types(
        str(Path(project_root) / "review-types")
    )


def _sweep_stale_reviews():
    """Remove reviews older than TTL. Called on each new review start."""
    now = time.time()
    stale = [
        rid for rid, r in _reviews.items()
        if now - r.get("created_at", now) > _REVIEW_TTL
    ]
    for rid in stale:
        _reviews.pop(rid, None)


class ReviewRequest(BaseModel):
    document: str
    model_ids: list[str]
    review_type_id: str
    context: Optional[str] = None
    max_tokens: int = 8192

    @field_validator("document")
    @classmethod
    def document_not_too_large(cls, v):
        if len(v.encode("utf-8")) > MAX_DOCUMENT_SIZE:
            raise ValueError(
                f"Document exceeds {MAX_DOCUMENT_SIZE // 1024} KB limit"
            )
        return v


@review_router.get("/types")
def list_review_types():
    """List available review types."""
    if not _review_types:
        return {"types": []}
    return {
        "types": [
            {
                "id": rt["id"],
                "label": rt["label"],
                "description": rt["description"],
            }
            for rt in _review_types.values()
        ]
    }


@review_router.post("/extract")
async def extract_file(file: UploadFile = File(...)):
    """Extract text from an uploaded file. Returns text for the textarea.

    Accepts: .txt, .md, .html, .pdf
    The extracted text is returned so the user can review and edit
    before sending for review via /start.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()

    if len(content) > MAX_DOCUMENT_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds {MAX_DOCUMENT_SIZE // 1024} KB limit",
        )

    try:
        text = extract_text(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "text": text,
        "filename": file.filename,
        "size": len(content),
        "extracted_length": len(text),
    }


@review_router.post("/start")
async def start_review(req: ReviewRequest):
    """Start a multi-model review. Returns review_id for SSE streaming."""
    if not _review_types:
        raise HTTPException(status_code=500, detail="No review types loaded")
    if req.review_type_id not in _review_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown review type: {req.review_type_id}",
        )
    if not req.model_ids:
        raise HTTPException(status_code=400, detail="No models selected")
    if not req.document.strip():
        raise HTTPException(status_code=400, detail="Document is empty")

    _sweep_stale_reviews()

    review_id = str(uuid.uuid4())[:8]
    review_type = _review_types[req.review_type_id]

    queue = asyncio.Queue()
    _reviews[review_id] = {
        "queue": queue,
        "created_at": time.time(),
        "review_type": req.review_type_id,
        "model_ids": req.model_ids,
        "total": len(req.model_ids),
        "completed": 0,
    }

    async def _run():
        try:
            async for result in run_review(
                document=req.document,
                review_type=review_type,
                model_ids=req.model_ids,
                vendors=_vendors,
                context=req.context,
                max_tokens=req.max_tokens,
            ):
                _reviews[review_id]["completed"] += 1
                await queue.put({"type": "result", **result})
            await queue.put({"type": "done"})
        except Exception as e:
            await queue.put({"type": "error", "message": str(e)})

    asyncio.create_task(_run())

    return {"review_id": review_id, "total": len(req.model_ids)}


@review_router.get("/stream/{review_id}")
async def stream_review(review_id: str):
    """SSE stream of review results as they complete."""
    if review_id not in _reviews:
        raise HTTPException(status_code=404, detail="Review not found")

    queue = _reviews[review_id]["queue"]

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120)
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] in ("done", "error"):
                    _reviews.pop(review_id, None)
                    break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
