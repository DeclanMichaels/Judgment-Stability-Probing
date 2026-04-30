"""
openai_compat.py - Provider adapter for OpenAI-compatible APIs.

Works with OpenAI, xAI (Grok), and Together AI. All three use the
same chat completions endpoint shape with different base URLs and keys.

Note: OpenAI GPT-5+ models require max_completion_tokens instead of
max_tokens. We detect OpenAI by api_base and send the right parameter.
"""

import time
from typing import Optional

import httpx

from .base import BaseProvider, ProviderResponse


class OpenAICompatProvider(BaseProvider):
    """Adapter for OpenAI-compatible chat completions APIs."""

    def _is_openai(self) -> bool:
        """Check if this provider points to OpenAI's API."""
        return "api.openai.com" in self.api_base

    async def send_message(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> ProviderResponse:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        body = {
            "model": self.model_id,
            "temperature": temperature,
            "messages": messages,
        }

        # OpenAI GPT-5+ requires max_completion_tokens instead of max_tokens.
        # Other OpenAI-compatible providers (xAI, Together) still use max_tokens.
        if self._is_openai():
            body["max_completion_tokens"] = max_tokens
        else:
            body["max_tokens"] = max_tokens

        # Merge any extra body params from model registry (e.g. disable thinking)
        if self.extra_body:
            body.update(self.extra_body)

        url = f"{self.api_base}/chat/completions"

        start = time.monotonic()
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                detail = resp.text[:500]
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code} from {self.api_base} ({self.model_id}): {detail}",
                    request=resp.request,
                    response=resp,
                )

        latency_ms = int((time.monotonic() - start) * 1000)
        data = resp.json()

        text = ""
        choices = data.get("choices", [])
        if choices:
            text = choices[0].get("message", {}).get("content", "")

        usage = data.get("usage", {})

        return ProviderResponse(
            text=text,
            tokens_in=usage.get("prompt_tokens", 0),
            tokens_out=usage.get("completion_tokens", 0),
            latency_ms=latency_ms,
            raw=data,
        )