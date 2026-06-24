from typing import Any

import httpx
from fastapi.responses import RedirectResponse

from app.config import Settings
from app.models import IntegrationProvider
from app.services.integrations.plugin import IntegrationPlugin, IntegrationRegistry, PluginStatus
from app.services.integrations.slack import (
    get_slack_metadata,
    is_slack_connected,
    save_slack_integration,
    update_slack_settings,
)

SLACK_SCOPES = [
    "channels:history",
    "channels:read",
    "channels:join",
    "groups:history",
    "groups:read",
    "im:history",
    "im:read",
    "users:read",
    "chat:write",
    "canvases:write",
]


class SlackPlugin(IntegrationPlugin):
    slug = "slack"
    provider = IntegrationProvider.SLACK

    def is_configured(self, settings: Settings) -> bool:
        return bool(settings.slack_client_id and settings.slack_client_secret)

    async def get_status(self, user_id: str, settings: Settings) -> PluginStatus:
        connected = await is_slack_connected(user_id)
        metadata = await get_slack_metadata(user_id) if connected else None
        return PluginStatus(
            connected=connected,
            configured=self.is_configured(settings),
            metadata=metadata,
            extras={"slackSettings": metadata},
        )

    def oauth_start(self, user_id: str, settings: Settings, origin: str) -> RedirectResponse:
        if not self.is_configured(settings):
            return RedirectResponse(f"{origin}/settings?slack=not_configured")

        redirect_uri = f"{origin}/api/integrations/slack/callback"
        scopes = ",".join(SLACK_SCOPES)
        url = (
            f"https://slack.com/oauth/v2/authorize"
            f"?client_id={settings.slack_client_id}"
            f"&scope={scopes}"
            f"&redirect_uri={redirect_uri}"
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
            return RedirectResponse(f"{origin}/settings?slack=error")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://slack.com/api/oauth.v2.access",
                data={
                    "client_id": settings.slack_client_id,
                    "client_secret": settings.slack_client_secret,
                    "code": code,
                    "redirect_uri": f"{origin}/api/integrations/slack/callback",
                },
            )
            data = response.json()

        if not data.get("ok"):
            return RedirectResponse(f"{origin}/settings?slack=error")

        await save_slack_integration(
            state,
            data["access_token"],
            {
                "teamId": data.get("team", {}).get("id"),
                "teamName": data.get("team", {}).get("name"),
                "slackUserId": data.get("authed_user", {}).get("id"),
                "autoHuddleCapture": True,
                "slackApprovals": True,
                "slackLiveNotes": True,
            },
        )
        return RedirectResponse(f"{origin}/settings?slack=connected")

    async def patch_settings(self, user_id: str, body: dict[str, Any]) -> None:
        await update_slack_settings(user_id, body)


slack_plugin = IntegrationRegistry.register(SlackPlugin())
