"""
base.py - Abstract base class for provider adapters.

All providers implement send_message() which takes a prompt string
and parameters, returns the raw response text and metadata.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ProviderResponse:
    """Standard response from any provider adapter."""
    text: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    raw: dict  # Full API response for debugging


class BaseProvider(ABC):
    """Abstract base class for all provider adapters."""

    def __init__(self, api_base: str, api_key: str, model_id: str, extra_body: Optional[dict] = None):
        self.api_base = api_base
        self.api_key = api_key
        self.model_id = model_id
        self.extra_body = extra_body or {}

    @abstractmethod
    async def send_message(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> ProviderResponse:
        """Send a message to the model and return the response."""
        pass
