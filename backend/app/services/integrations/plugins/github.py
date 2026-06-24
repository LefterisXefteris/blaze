from typing import Any

import httpx
from fastapi.responses import RedirectResponse

from app.config import Settings
from app.models import IntegrationProvider
from app.services.integrations.github import (
    fetch_github_user,
    get_github_metadata,
    is_github_connected,
    save_github_integration,
    update_github_settings,
)
from app.services.integrations.plugin import IntegrationPlugin, IntegrationRegistry, PluginStatus


class GitHubPlugin(IntegrationPlugin):
    slug = "github"
    provider = IntegrationProvider.GITHUB

    def is_configured(self, settings: Settings) -> bool:
        return bool(settings.github_client_id and settings.github_client_secret)

    async def get_status(self, user_id: str, settings: Settings) -> PluginStatus:
        connected = await is_github_connected(user_id)
        metadata = await get_github_metadata(user_id) if connected else None
        return PluginStatus(
            connected=connected,
            configured=self.is_configured(settings),
            metadata=metadata,
            extras={
                "githubLogin": metadata.get("githubLogin") if metadata else None,
                "githubSettings": metadata,
            },
        )

    def oauth_start(self, user_id: str, settings: Settings, origin: str) -> RedirectResponse:
        if not self.is_configured(settings):
            return RedirectResponse(f"{origin}/settings?github=not_configured")

        redirect_uri = f"{origin}/api/integrations/github/callback"
        url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={settings.github_client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&scope=read:user repo"
            f"&state={user_id}"
        )
        return RedirectResponse(url)

    async def oauth_callback(
        self,
        code: str | None,
        state: str | None,
        error: str | None,
        settings: Settings,
        origin: str,
    ) -> RedirectResponse:
        if error or not code or not state:
            return RedirectResponse(f"{origin}/settings?github=error")

        async with httpx.AsyncClient() as client:
            token_res = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                json={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": f"{origin}/api/integrations/github/callback",
                },
            )
            token_data = token_res.json()

        if token_data.get("error") or not token_data.get("access_token"):
            return RedirectResponse(f"{origin}/settings?github=error")

        gh_user = await fetch_github_user(token_data["access_token"])
        await save_github_integration(
            state,
            token_data["access_token"],
            {
                "githubLogin": gh_user["login"],
                "autoAssign": True,
                "autoMention": True,
                "autoReview": True,
                "autoAckMention": True,
            },
        )
        return RedirectResponse(f"{origin}/settings?github=connected")

    async def patch_settings(self, user_id: str, body: dict[str, Any]) -> None:
        await update_github_settings(user_id, body)


github_plugin = IntegrationRegistry.register(GitHubPlugin())
