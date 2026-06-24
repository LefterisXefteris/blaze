from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi.responses import RedirectResponse

from app.config import Settings
from app.models import IntegrationProvider
from app.services.integrations.google_calendar import (
    is_google_connected,
    save_google_integration,
)
from app.services.integrations.plugin import IntegrationPlugin, IntegrationRegistry, PluginStatus

GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]


class GoogleCalendarPlugin(IntegrationPlugin):
    slug = "google"
    provider = IntegrationProvider.GOOGLE_CALENDAR

    def is_configured(self, settings: Settings) -> bool:
        return bool(settings.google_client_id and settings.google_client_secret)

    async def get_status(self, user_id: str, settings: Settings) -> PluginStatus:
        connected = await is_google_connected(user_id)
        return PluginStatus(
            connected=connected,
            configured=self.is_configured(settings),
        )

    def oauth_start(self, user_id: str, settings: Settings, origin: str) -> RedirectResponse:
        if not self.is_configured(settings):
            return RedirectResponse(f"{origin}/settings?google=not_configured")

        redirect_uri = f"{origin}/api/integrations/google/callback"
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_CALENDAR_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": user_id,
        }
        return RedirectResponse(
            f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        )

    async def oauth_callback(
        self,
        code: str | None,
        state: str | None,
        error: str | None,
        settings: Settings,
        origin: str,
    ) -> RedirectResponse:
        if error or not code or not state:
            return RedirectResponse(f"{origin}/settings?google=error")

        redirect_uri = f"{origin}/api/integrations/google/callback"
        async with httpx.AsyncClient() as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
            token_data = token_res.json()

        if token_data.get("error") or not token_data.get("access_token"):
            return RedirectResponse(f"{origin}/settings?google=error")

        expires_at = None
        if token_data.get("expires_in"):
            expires_at = datetime.now(timezone.utc) + timedelta(
                seconds=int(token_data["expires_in"])
            )

        await save_google_integration(
            state,
            token_data["access_token"],
            token_data.get("refresh_token"),
            expires_at,
        )
        return RedirectResponse(f"{origin}/settings?google=connected")


google_plugin = IntegrationRegistry.register(GoogleCalendarPlugin())
