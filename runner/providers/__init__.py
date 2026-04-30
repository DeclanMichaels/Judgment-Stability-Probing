"""
providers - Factory for creating the right provider adapter based on api_style.
"""

from .base import BaseProvider, ProviderResponse
from .anthropic import AnthropicProvider
from .openai_compat import OpenAICompatProvider
from .google import GoogleProvider


def create_provider(api_style: str, api_base: str, api_key: str, model_id: str, extra_body: dict = None) -> BaseProvider:
    """Create a provider adapter based on the api_style field from vendor config."""
    if api_style == "anthropic":
        return AnthropicProvider(api_base, api_key, model_id, extra_body=extra_body)
    elif api_style == "openai":
        return OpenAICompatProvider(api_base, api_key, model_id, extra_body=extra_body)
    elif api_style == "google":
        return GoogleProvider(api_base, api_key, model_id, extra_body=extra_body)
    else:
        raise ValueError(f"Unknown api_style: {api_style}")


__all__ = [
    "create_provider",
    "BaseProvider",
    "ProviderResponse",
    "AnthropicProvider",
    "OpenAICompatProvider",
    "GoogleProvider",
]
