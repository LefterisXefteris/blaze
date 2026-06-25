"""GitHub integration adapter."""

from __future__ import annotations

from typing import Any

from app.services.integrations.adapters.base import IntegrationAdapter
from app.services.integrations.github import post_issue_comment as github_post_comment


class GitHubAdapter(IntegrationAdapter):
    provider = "GITHUB"

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
        return await github_post_comment(user_id, repo, issue_number, body)

    async def create_calendar_event(
        self,
        user_id: str,
        event_data: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError("Use GoogleAdapter")
