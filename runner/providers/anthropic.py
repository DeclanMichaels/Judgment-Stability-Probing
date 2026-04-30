"""
anthropic.py - Provider adapter for Anthropic's Messages API.
"""

import time
from typing import Optional

import httpx

from .base import BaseProvider, ProviderResponse


class AnthropicProvider(BaseProvider):
    """Adapter for Anthropic's native Messages API."""

    async def send_message(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> ProviderResponse:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        body = {
            "model": self.model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        if system_prompt:
            body["system"] = system_prompt

        url = f"{self.api_base}/messages"

        start = time.monotonic()
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                detail = resp.text[:500]
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code} from Anthropic ({self.model_id}): {detail}",
                    request=resp.request,
                    response=resp,
                )

        latency_ms = int((time.monotonic() - start) * 1000)
        data = resp.json()

        text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block["text"]

        usage = data.get("usage", {})

        return ProviderResponse(
            text=text,
            tokens_in=usage.get("input_tokens", 0),
            tokens_out=usage.get("output_tokens", 0),
            latency_ms=latency_ms,
            raw=data,
        )