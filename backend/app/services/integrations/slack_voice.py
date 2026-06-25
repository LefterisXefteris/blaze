"""Post voice transcript lines from Blaze back into Slack."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSessionStatus, CaptureSourceType
from app.services.integrations.slack import get_slack_client
from app.services.integrations.slack_common import (
    slack_meta,
    truncate,
    user_allows_slack_live_notes,
)

_VOICE_LINE_COOLDOWN_SEC = 6
_last_voice_post: dict[str, float] = {}


async def notify_slack_voice_line(session_id: str, speaker: str, content: str) -> None:
    """Echo a committed voice transcript line into the Slack thread."""
    trimmed = (content or "").strip()
    if not trimmed:
        return

    now = time.time()
    last = _last_voice_post.get(session_id, 0)
    if now - last < _VOICE_LINE_COOLDOWN_SEC:
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if (
        not session
        or session.status != CaptureSessionStatus.ACTIVE
        or session.sourceType != CaptureSourceType.SLACK
        or not session.sourceRef
    ):
        return

    if not await user_allows_slack_live_notes(session.userId):
        return

    client = await get_slack_client(session.userId)
    if not client:
        return

    meta = slack_meta(session)
    thread_ts = meta.get("huddleThreadTs") or meta.get("liveNotesMessageTs")
    settings = get_settings()
    engine = "ElevenLabs Scribe" if settings.elevenlabs_api_key else "browser speech"

    text = f"🎙 {speaker}: {truncate(trimmed, 500)}"
    post_kwargs: dict[str, Any] = {
        "channel": session.sourceRef,
        "text": text,
        "blocks": [
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": (
                            f"🎙 *{speaker}* ({engine}): "
                            f"_{truncate(trimmed, 900)}_"
                        ),
                    }
                ],
            }
        ],
    }
    if thread_ts:
        post_kwargs["thread_ts"] = thread_ts

    try:
        client.chat_postMessage(**post_kwargs)
        _last_voice_post[session_id] = now
    except Exception as error:
        print(f"Slack voice line post failed for {session_id}: {error}")
