"""Resolve integration adapters by provider."""

from __future__ import annotations

from app.models import IntegrationProvider
from app.services.integrations.adapters.base import IntegrationAdapter
from app.services.integrations.adapters.github import GitHubAdapter
from app.services.integrations.adapters.google import GoogleAdapter
from app.services.integrations.adapters.slack import SlackAdapter

_adapters: dict[str, IntegrationAdapter] = {
    IntegrationProvider.SLACK.value: SlackAdapter(),
    IntegrationProvider.GITHUB.value: GitHubAdapter(),
    IntegrationProvider.GOOGLE_CALENDAR.value: GoogleAdapter(),
}


def get_adapter(provider: str | IntegrationProvider) -> IntegrationAdapter:
    key = provider.value if hasattr(provider, "value") else str(provider)
    adapter = _adapters.get(key)
    if not adapter:
        raise ValueError(f"No adapter for provider: {provider}")
    return adapter
