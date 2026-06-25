"""Respond when someone pings Blaze in Slack."""

from __future__ import annotations

import re
import time
from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    Integration,
    IntegrationProvider,
)
from app.services.integrations.slack import get_slack_client
from app.services.integrations.slack_approvals import APPROVAL_COMMAND
from app.services.integrations.slack_meetings import start_slack_meeting_session
from app.services.integrations.slack_common import session_open_hint
from app.utils import app_origin

# channel_id -> last response unix time
_PING_COOLDOWN_SEC = 45
_recent_pings: dict[str, float] = {}

_PING_PHRASES = re.compile(
    r"(?:you\s+there|are\s+you\s+there|u\s+there|anyone\s+home|listening|ready|online|hello|hey|hi)\b",
    re.IGNORECASE,
)
_BLAZE_ONLY = re.compile(r"^(?:<@[^>]+>\s*)?blaze[?!.]*$", re.IGNORECASE)


def _is_blaze_ping(text: str) -> bool:
    cleaned = (text or "").strip()
    if not cleaned or APPROVAL_COMMAND.match(cleaned):
        return False
    if not re.search(r"\bblaze\b", cleaned, re.IGNORECASE):
        return False
    if _BLAZE_ONLY.match(cleaned):
        return True
    return bool(_PING_PHRASES.search(cleaned))


async def _integrations_for_team(team_id: str | None) -> list[Integration]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(Integration.provider == IntegrationProvider.SLACK)
        )
        integrations = result.scalars().all()

    if not team_id:
        return list(integrations)
    return [i for i in integrations if (i.metadata_ or {}).get("teamId") == team_id]


async def _active_session(user_id: str, channel_id: str) -> CaptureSession | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.userId == user_id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
                CaptureSession.sourceType == CaptureSourceType.SLACK,
                CaptureSession.sourceRef == channel_id,
            )
        )
        return result.scalar_one_or_none()


def _ping_reply(session: CaptureSession | None, *, started: bool) -> str:
    url = f"{app_origin()}/sessions/{session.id}" if session else app_origin()
    open_hint = session_open_hint(session_id=session.id) if session else ""
    if started:
        base = (
            f"I'm here — live notes are on for this channel. "
            f"Type in this thread and I'll capture + summarize. "
            f"<{url}|Open in Blaze>"
        )
    else:
        base = (
            f"I'm here — already taking notes in this channel. "
            f"Keep typing and I'll keep summarizing. "
            f"<{url}|Open in Blaze>"
        )
    return f"{base}\n{open_hint}" if open_hint else base


async def try_handle_blaze_ping(
    channel_id: str,
    slack_user_id: str | None,
    text: str,
    team_id: str | None = None,
    *,
    thread_ts: str | None = None,
    bot_id: str | None = None,
) -> bool:
    """Reply in-channel when someone addresses Blaze. Returns True if handled."""
    if bot_id or not slack_user_id or not _is_blaze_ping(text):
        return False

    now = time.time()
    last = _recent_pings.get(channel_id, 0)
    if now - last < _PING_COOLDOWN_SEC:
        return True

    integrations = await _integrations_for_team(team_id)
    if not integrations:
        return False

    integration = integrations[0]
    client = await get_slack_client(integration.userId)
    if not client:
        return False

    session = await _active_session(integration.userId, channel_id)
    started = False
    if not session:
        session = await start_slack_meeting_session(
            integration.userId,
            channel_id,
            huddle=False,
            auto_started=True,
        )
        started = True

    reply = _ping_reply(session, started=started)
    post_kwargs: dict[str, Any] = {
        "channel": channel_id,
        "text": reply,
    }
    if thread_ts:
        post_kwargs["thread_ts"] = thread_ts

    try:
        client.chat_postMessage(**post_kwargs)
        _recent_pings[channel_id] = now
    except Exception as error:
        print(f"Blaze ping reply failed for {channel_id}: {error}")
        return False

    return True
