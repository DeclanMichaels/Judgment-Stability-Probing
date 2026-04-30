"""
google.py - Provider adapter for Google's Gemini API.

Uses the generateContent REST endpoint directly via httpx.

Note: Gemini 3+ models use thinking_level (minimal/low/medium/high)
instead of the legacy thinkingBudget parameter. Sending thinkingBudget
to a Gemini 3 model causes a 400 error.
"""

import time
from typing import Optional

import httpx

from .base import BaseProvider, ProviderResponse


class GoogleProvider(BaseProvider):
    """Adapter for Google's Gemini generateContent API."""

    def _is_gemini_3_plus(self) -> bool:
        """Check if this is a Gemini 3.x+ model that uses thinking_level."""
        # Gemini 3 models: gemini-3-pro-preview, gemini-3.1-pro-preview, etc.
        # Gemini 2.x models: gemini-2.5-flash, gemini-2.5-pro, etc.
        parts = self.model_id.split("-")
        for part in parts:
            # Look for the version number segment
            try:
                version = float(part.split(".")[0]) if "." not in part else float(part)
            except ValueError:
                continue
            if version >= 3:
                return True
        return False

    async def send_message(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> ProviderResponse:
        url = (
            f"{self.api_base}/models/{self.model_id}:generateContent"
            f"?key={self.api_key}"
        )

        contents = []
        if system_prompt:
            contents.append({
                "role": "user",
                "parts": [{"text": system_prompt}],
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I will follow these instructions."}],
            })

        contents.append({
            "role": "user",
            "parts": [{"text": prompt}],
        })

        generation_config = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }

        # Gemini 3+ uses thinking_level; older models use thinkingBudget.
        # We want minimal/no thinking for experiment comparability.
        if self._is_gemini_3_plus():
            # Gemini 3.1 Pro supports LOW/MEDIUM/HIGH (not MINIMAL).
            # LOW is the least thinking available for this model.
            generation_config["thinkingConfig"] = {
                "thinkingLevel": "LOW",
            }
        else:
            generation_config["thinkingConfig"] = {
                "thinkingBudget": 0,
            }

        body = {
            "contents": contents,
            "generationConfig": generation_config,
        }

        start = time.monotonic()
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json=body,
            )
            if resp.status_code >= 400:
                detail = resp.text[:500]
                raise httpx.HTTPStatusError(
                    f"HTTP {resp.status_code} from Google ({self.model_id}): {detail}",
                    request=resp.request,
                    response=resp,
                )

        latency_ms = int((time.monotonic() - start) * 1000)
        data = resp.json()

        text = ""
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                if "text" in part:
                    text += part["text"]

        usage = data.get("usageMetadata", {})

        return ProviderResponse(
            text=text,
            tokens_in=usage.get("promptTokenCount", 0),
            tokens_out=usage.get("candidatesTokenCount", 0),
            latency_ms=latency_ms,
            raw=data,
        )