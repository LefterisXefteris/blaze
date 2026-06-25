"""Slack integration adapter."""

from __future__ import annotations

from typing import Any

from app.services.integrations.adapters.base import IntegrationAdapter
from app.services.integrations.slack import get_slack_client


class SlackAdapter(IntegrationAdapter):
    provider = "SLACK"

    async def post_message(
        self,
        user_id: str,
        channel: str,
        text: str,
        *,
        thread_ts: str | None = None,
        blocks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        client = await get_slack_client(user_id)
        if not client:
            return None
        kwargs: dict[str, Any] = {"channel": channel, "text": text}
        if thread_ts:
            kwargs["thread_ts"] = thread_ts
        if blocks:
            kwargs["blocks"] = blocks
        return client.chat_postMessage(**kwargs)

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
        raise NotImplementedError("Use GoogleAdapter")
