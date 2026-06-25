from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from fastapi.responses import RedirectResponse

from app.config import Settings
from app.models import IntegrationProvider


@dataclass
class PluginStatus:
    connected: bool
    configured: bool
    metadata: dict[str, Any] | None = None
    extras: dict[str, Any] = field(default_factory=dict)


class IntegrationPlugin(ABC):
    """Contract for OAuth-backed connections shown on the Settings page.

    To add a connection:
      1. Create ``plugins/<slug>.py`` subclassing this class.
      2. Call ``IntegrationRegistry.register(MyPlugin())`` at module bottom.
      3. Import the module in ``plugins/__init__.py``.

    Routes are generic: ``GET /api/integrations/{slug}`` and ``/callback``.
    """

    slug: str
    provider: IntegrationProvider

    @abstractmethod
    def is_configured(self, settings: Settings) -> bool: ...

    @abstractmethod
    async def get_status(self, user_id: str, settings: Settings) -> PluginStatus: ...

    @abstractmethod
    def oauth_start(self, user_id: str, settings: Settings, origin: str) -> RedirectResponse: ...

    @abstractmethod
    async def oauth_callback(
        self,
        code: str | None,
        state: str | None,
        error: str | None,
        settings: Settings,
        origin: str,
    ) -> RedirectResponse: ...

    async def patch_settings(self, user_id: str, body: dict[str, Any]) -> None:
        raise HTTPException(400, f"{self.slug} does not support settings updates")

    def to_status_response(self, status: PluginStatus) -> dict[str, Any]:
        """Legacy flat keys consumed by existing clients."""
        return {
            self.slug: status.connected,
            f"{self.slug}Configured": status.configured,
            **status.extras,
        }


class IntegrationRegistry:
    _plugins: dict[str, IntegrationPlugin] = {}

    @classmethod
    def register(cls, plugin: IntegrationPlugin) -> IntegrationPlugin:
        cls._plugins[plugin.slug] = plugin
        return plugin

    @classmethod
    def get(cls, slug: str) -> IntegrationPlugin:
        try:
            return cls._plugins[slug]
        except KeyError as exc:
            raise HTTPException(404, f"Unknown integration: {slug}") from exc

    @classmethod
    def all(cls) -> list[IntegrationPlugin]:
        return list(cls._plugins.values())
