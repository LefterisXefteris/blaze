"""Post voice transcript lines from Blaze back into Slack."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSessionStatus, CaptureSourceType
from app.services.integrations.slack import get_slack_client
from app.services.integrations.slack_approvals import (
    _slack_meta,
    _truncate,
    _user_allows_slack_live_notes,
)

_VOICE_LINE_COOLDOWN_SEC = 6
_last_voice_post: dict[str, float] = {}


def _voice_session_url(session_id: str) -> str:
    from app.utils import app_origin

    return f"{app_origin()}/sessions/{session_id}"


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

    if not await _user_allows_slack_live_notes(session.userId):
        return

    client = await get_slack_client(session.userId)
    if not client:
        return

    slack_meta = _slack_meta(session)
    thread_ts = slack_meta.get("huddleThreadTs") or slack_meta.get("liveNotesMessageTs")
    settings = get_settings()
    engine = "ElevenLabs Scribe" if settings.elevenlabs_api_key else "browser speech"

    text = f"🎙 {speaker}: {_truncate(trimmed, 500)}"
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
                            f"_{_truncate(trimmed, 900)}_"
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


def voice_listen_hint(*, elevenlabs_configured: bool, session_id: str) -> str:
    url = _voice_session_url(session_id)
    if elevenlabs_configured:
        return (
            f"🎙 *Voice:* open <{url}|Blaze> and keep the tab open — "
            f"I'll listen with *ElevenLabs Scribe* and post lines here + in live notes."
        )
    return (
        f"🎙 *Voice:* open <{url}|Blaze> and allow mic access — "
        f"add `ELEVENLABS_API_KEY` for best quality (falls back to browser speech)."
    )
