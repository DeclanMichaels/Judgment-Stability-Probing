"""
review.py - Multi-model document review with fan-out.

Loads review type configs, instantiates provider adapters for each
selected model, sends the document concurrently, and yields results
as they complete.
"""

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import AsyncGenerator, Optional

from .registry import find_model
from .providers.anthropic import AnthropicProvider
from .providers.google import GoogleProvider
from .providers.openai_compat import OpenAICompatProvider


PROVIDER_MAP = {
    "anthropic": AnthropicProvider,
    "google": GoogleProvider,
    "openai_compat": OpenAICompatProvider,
    "openai": OpenAICompatProvider,
}

# Maximum document size in bytes (500 KB)
MAX_DOCUMENT_SIZE = 512_000


def load_review_types(review_types_dir: str) -> dict:
    """Load all review type JSON configs from directory.
    Returns dict keyed by review type ID.
    """
    types = {}
    rt_path = Path(review_types_dir)
    if not rt_path.exists():
        return types
    for f in sorted(rt_path.glob("*.json")):
        with open(f) as fh:
            config = json.load(fh)
        types[config["id"]] = config
    return types


def build_prompt(review_type: dict, document: str, context: Optional[str] = None) -> str:
    """Build the user prompt from template and document.

    Uses a sentinel split rather than string replace so document
    content containing '{document}' or '{context}' won't be mangled.
    """
    template = review_type["user_template"]

    # Split on the placeholder, insert document between halves
    parts = template.split("{document}", 1)
    if len(parts) == 2:
        prompt = parts[0] + document + parts[1]
    else:
        # No placeholder found; append document
        prompt = template + "\n\n" + document

    if context:
        ctx_parts = prompt.split("{context}", 1)
        if len(ctx_parts) == 2:
            prompt = ctx_parts[0] + context + ctx_parts[1]

    return prompt


def make_provider(model_info: dict):
    """Instantiate the right provider adapter for a model."""
    api_style = model_info["api_style"]
    provider_class = PROVIDER_MAP.get(api_style)
    if not provider_class:
        raise ValueError(f"Unknown api_style: {api_style}")

    api_key = os.environ.get(model_info["auth_env_var"], "")
    if not api_key:
        raise ValueError(
            f"Missing API key: {model_info['auth_env_var']} not set in environment"
        )

    return provider_class(
        api_base=model_info["api_base"],
        api_key=api_key,
        model_id=model_info["model"]["id"],
    )


async def review_single_model(
    model_id: str,
    model_label: str,
    provider,
    prompt: str,
    system_prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 8192,
) -> dict:
    """Send review prompt to a single model and return result."""
    start = time.monotonic()
    try:
        response = await provider.send_message(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        elapsed = int((time.monotonic() - start) * 1000)
        return {
            "model_id": model_id,
            "model_label": model_label,
            "status": "complete",
            "text": response.text,
            "tokens_in": response.tokens_in,
            "tokens_out": response.tokens_out,
            "latency_ms": elapsed,
        }
    except Exception as e:
        elapsed = int((time.monotonic() - start) * 1000)
        return {
            "model_id": model_id,
            "model_label": model_label,
            "status": "error",
            "text": str(e),
            "tokens_in": 0,
            "tokens_out": 0,
            "latency_ms": elapsed,
        }


async def run_review(
    document: str,
    review_type: dict,
    model_ids: list[str],
    vendors: dict,
    context: Optional[str] = None,
    max_tokens: int = 8192,
) -> AsyncGenerator[dict, None]:
    """Fan out review to multiple models, yield results as they complete.

    Yields dicts with keys: model_id, model_label, status, text,
    tokens_in, tokens_out, latency_ms.
    """
    if len(document.encode("utf-8")) > MAX_DOCUMENT_SIZE:
        yield {
            "model_id": "system",
            "model_label": "System",
            "status": "error",
            "text": f"Document exceeds {MAX_DOCUMENT_SIZE // 1024} KB limit",
            "tokens_in": 0,
            "tokens_out": 0,
            "latency_ms": 0,
        }
        return

    prompt = build_prompt(review_type, document, context)
    system_prompt = review_type.get("system_prompt", "")
    temperature = review_type.get("temperature", 0.7)

    # Build tasks
    tasks = {}
    for model_id in model_ids:
        model_info = find_model(vendors, model_id)
        if not model_info:
            yield {
                "model_id": model_id,
                "model_label": model_id,
                "status": "error",
                "text": f"Model not found in registry: {model_id}",
                "tokens_in": 0,
                "tokens_out": 0,
                "latency_ms": 0,
            }
            continue

        try:
            provider = make_provider(model_info)
        except ValueError as e:
            yield {
                "model_id": model_id,
                "model_label": model_info["model"]["label"],
                "status": "error",
                "text": str(e),
                "tokens_in": 0,
                "tokens_out": 0,
                "latency_ms": 0,
            }
            continue

        task = asyncio.create_task(
            review_single_model(
                model_id=model_id,
                model_label=model_info["model"]["label"],
                provider=provider,
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        )
        tasks[task] = model_id

    # Yield results as they complete
    for coro in asyncio.as_completed(tasks.keys()):
        result = await coro
        yield result
