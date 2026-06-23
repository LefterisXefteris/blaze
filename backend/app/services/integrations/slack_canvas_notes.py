"""Slack Canvas live notes — appears in the channel/huddle canvas panel."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import CaptureSession
from app.services.integrations.slack import get_slack_client
from app.utils import app_origin

LIVE_NOTES_PLACEHOLDER = (
    "_Taking notes… type in this thread and Blaze will summarize key points, "
    "decisions, and action items here._"
)


def _session_url(session_id: str) -> str:
    return f"{app_origin()}/sessions/{session_id}"


def _truncate(text: str, limit: int = 280) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _slack_meta(session: CaptureSession) -> dict[str, Any]:
    meta = session.metadata_ or {}
    slack = meta.get("slack")
    return slack if isinstance(slack, dict) else {}


async def _merge_session_slack_meta(session_id: str, updates: dict[str, Any]) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return
        meta = dict(session.metadata_ or {})
        slack = dict(meta.get("slack") or {})
        slack.update(updates)
        meta["slack"] = slack
        session.metadata_ = meta
        await db.commit()


def _canvas_markdown(session: CaptureSession, body: str) -> str:
    title = session.title or "Live meeting"
    note_body = body.strip() or LIVE_NOTES_PLACEHOLDER
    blaze_url = _session_url(session.id)
    return (
        f"# Blaze live notes\n"
        f"**{title}**\n\n"
        f"{_truncate(note_body, 12000)}\n\n"
        f"---\n"
        f"Type in the huddle thread or channel — Blaze updates this canvas as you go. "
        f"[Open in Blaze]({blaze_url})"
    )


async def sync_live_notes_canvas(session: CaptureSession, summary: str) -> str | None:
    """Create or replace a channel-tab canvas with live meeting notes."""
    if not session.sourceRef:
        return None

    client = await get_slack_client(session.userId)
    if not client:
        return None

    slack_meta = _slack_meta(session)
    canvas_id = slack_meta.get("notesCanvasId")
    markdown = _canvas_markdown(session, summary)
    doc = {"type": "markdown", "markdown": markdown}

    try:
        if canvas_id:
            result = client.canvases_edit(
                canvas_id=canvas_id,
                changes=[{"operation": "replace", "document_content": doc}],
            )
            if not result.get("ok"):
                canvas_id = None

        if not canvas_id:
            result = client.canvases_create(
                title=f"Blaze · {session.title or 'Live notes'}",
                channel_id=session.sourceRef,
                document_content=doc,
            )
            if not result.get("ok"):
                print(f"Canvas create failed: {result.get('error')}")
                return None
            canvas_id = result.get("canvas_id")
            if canvas_id:
                await _merge_session_slack_meta(
                    session.id,
                    {"notesCanvasId": canvas_id},
                )
        return canvas_id
    except Exception as error:
        print(f"Canvas sync failed for {session.id}: {error}")
        return None


async def post_canvas_open_hint(
    session: CaptureSession,
    *,
    thread_ts: str | None = None,
) -> None:
    """Tell the user where to find the notes UI beside the huddle."""
    if not session.sourceRef:
        return

    client = await get_slack_client(session.userId)
    if not client:
        return

    blocks: list[dict[str, Any]] = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    "*📝 Blaze notes are ready*\n"
                    "• Click the **canvas** icon in the huddle bar (bottom-right) "
                    "to see live notes beside the meeting\n"
                    "• Or read the pinned card in this thread — it updates as you chat\n"
                    f"• <{_session_url(session.id)}|Open full session in Blaze>"
                ),
            },
        }
    ]

    post_kwargs: dict[str, Any] = {
        "channel": session.sourceRef,
        "text": "Blaze live notes — open the canvas tab in this huddle",
        "blocks": blocks,
    }
    if thread_ts:
        post_kwargs["thread_ts"] = thread_ts

    try:
        client.chat_postMessage(**post_kwargs)
    except Exception as error:
        print(f"Canvas hint post failed for {session.id}: {error}")
