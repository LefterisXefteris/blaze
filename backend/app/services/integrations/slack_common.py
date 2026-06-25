"""Shared Slack integration helpers (no imports from slack_approvals/slack_voice)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import CaptureSession, Integration, IntegrationProvider
from app.utils import app_origin


def truncate(text: str, limit: int = 280) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def slack_meta(session: CaptureSession) -> dict[str, Any]:
    meta = session.metadata_ or {}
    slack = meta.get("slack")
    return slack if isinstance(slack, dict) else {}


async def user_allows_slack_live_notes(user_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()
    if not integration:
        return False
    meta = integration.metadata_ or {}
    return meta.get("slackLiveNotes", True) is not False


def voice_listen_hint(*, elevenlabs_configured: bool, session_id: str) -> str:
    url = f"{app_origin()}/sessions/{session_id}"
    if elevenlabs_configured:
        return (
            f"🎙 *Voice:* open <{url}|Blaze> and keep the tab open — "
            f"I'll listen with *ElevenLabs Scribe* and post lines here + in live notes."
        )
    return (
        f"🎙 *Voice:* open <{url}|Blaze> and allow mic access — "
        f"add `ELEVENLABS_API_KEY` for best quality (falls back to browser speech)."
    )
