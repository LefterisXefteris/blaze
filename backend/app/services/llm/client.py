"""Central OpenAI client — Langfuse-instrumented when observability is enabled."""

from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.services.llm.observability import langfuse_enabled

if langfuse_enabled():
    from langfuse.openai import AsyncOpenAI
else:
    from openai import AsyncOpenAI


@lru_cache
def get_openai_client() -> AsyncOpenAI | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    return AsyncOpenAI(api_key=settings.openai_api_key)


def openai_available() -> bool:
    return get_openai_client() is not None
