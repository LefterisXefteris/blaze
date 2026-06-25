"""Integration adapter base — side-effect boundary for external services."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class IntegrationAdapter(ABC):
    provider: str

    @abstractmethod
    async def post_message(
        self,
        user_id: str,
        channel: str,
        text: str,
        *,
        thread_ts: str | None = None,
        blocks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        ...

    @abstractmethod
    async def post_issue_comment(
        self,
        user_id: str,
        repo: str,
        issue_number: int,
        body: str,
    ) -> dict[str, Any]:
        ...

    @abstractmethod
    async def create_calendar_event(
        self,
        user_id: str,
        event_data: dict[str, Any],
    ) -> dict[str, Any]:
        ...
