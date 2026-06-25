"""Google Calendar integration adapter."""

from __future__ import annotations

from typing import Any

from app.services.integrations.adapters.base import IntegrationAdapter
from app.services.integrations.google_calendar import create_calendar_event as gcal_create


class GoogleAdapter(IntegrationAdapter):
    provider = "GOOGLE_CALENDAR"

    async def post_message(
        self,
        user_id: str,
        channel: str,
        text: str,
        *,
        thread_ts: str | None = None,
        blocks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        raise NotImplementedError("Use SlackAdapter")

    async def post_issue_comment(
        self,
        user_id: str,
        repo: str,
        issue_number: int,
        body: str,
    ) -> dict[str, Any]:
        raise NotImplementedError("Use GitHubAdapter")

    async def create_calendar_event(
        self,
        user_id: str,
        event_data: dict[str, Any],
    ) -> dict[str, Any]:
        return await gcal_create(user_id, event_data)
