"""Single in-process Blaze agent pipeline: synthesize → recommend actions → side effects."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    Note,
)
from app.policy.engine import get_policy_engine
from app.services.agent.extractor import extract_intents, generate_live_summary, generate_note
from app.services.agent.note_agent import analyze_note_for_priority
from app.services.vector.context import persist_related_context, retrieve_meeting_context
from app.services.vector.indexer import index_live_meeting_transcript_incremental, index_meeting_session
from app.types import SessionMessage

PIPELINE_SOURCE_TYPES = {
    CaptureSourceType.MANUAL,
    CaptureSourceType.SLACK,
    CaptureSourceType.GITHUB,
}


async def _load_session_state(session_id: str) -> dict[str, Any] | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
                selectinload(CaptureSession.user),
            )
            .where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if not session or session.status != CaptureSessionStatus.ACTIVE:
        return None

    messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in session.messages
    ]

    existing_fingerprints: list[str] = []
    for action in session.agentActions:
        if action.status in (AgentActionStatus.REJECTED, AgentActionStatus.UNDONE):
            continue
        payload = action.payload or {}
        action_type = payload.get("type") or action.intentType.value.lower()
        title = (payload.get("title") or "").lower().strip()
        existing_fingerprints.append(f"{action_type}:{title}")

    msg_dicts = [
        {"speaker": m.speaker, "content": m.content}
        for m in messages
    ]

    return {
        "session": session,
        "session_id": session_id,
        "user_id": session.userId,
        "undo_window_min": session.user.undoWindowMin,
        "session_title": session.title,
        "source_type": session.sourceType,
        "user_notes": session.userNotes,
        "messages": messages,
        "msg_dicts": msg_dicts,
        "existing_fingerprints": existing_fingerprints,
        "run_context": session.sourceType in PIPELINE_SOURCE_TYPES,
    }


async def process_session(
    session_id: str,
    *,
    note_title: str | None = None,
    note_content: str | None = None,
    priority_item_ids: list[str] | None = None,
    excerpts: dict[str, str] | None = None,
) -> None:
    """Run the full Blaze pipeline for an active session."""
    state = await _load_session_state(session_id)
    if not state:
        return

    related_context_prompt: str | None = None
    if state["run_context"]:
        related = await retrieve_meeting_context(
            user_id=state["user_id"],
            session_id=session_id,
            title=state["session_title"],
            user_notes=state["user_notes"],
            messages=state["msg_dicts"],
        )
        await persist_related_context(session_id, related)
        related_context_prompt = related.promptText

        try:
            await index_live_meeting_transcript_incremental(
                user_id=state["user_id"],
                session_id=session_id,
                title=state["session_title"],
                user_notes=state["user_notes"],
                messages=state["msg_dicts"],
            )
        except Exception as error:
            print(f"Live index failed for {session_id}: {error}")

    live_summary = await generate_live_summary(
        state["messages"],
        state["user_notes"],
        {
            "title": state["session_title"],
            "sourceType": state["source_type"].value,
        },
        related_context_prompt,
    )

    if live_summary:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CaptureSession).where(CaptureSession.id == session_id)
            )
            row = result.scalar_one_or_none()
            if row:
                row.liveSummary = live_summary
                await db.commit()
                source_type = row.sourceType
            else:
                source_type = state["source_type"]

        if source_type == CaptureSourceType.SLACK:
            try:
                from app.services.integrations.slack_approvals import post_or_update_live_notes

                await post_or_update_live_notes(session_id, live_summary)
            except Exception as error:
                print(f"Slack live notes sync failed for {session_id}: {error}")

    if priority_item_ids and note_content:
        excerpt_map = excerpts or {}
        for priority_item_id in priority_item_ids:
            try:
                await analyze_note_for_priority(
                    user_id=state["user_id"],
                    session_id=session_id,
                    priority_item_id=priority_item_id,
                    note_title=note_title or "",
                    note_content=excerpt_map.get(priority_item_id) or note_content,
                )
            except Exception as error:
                print(f"Note analysis failed for {session_id} / {priority_item_id}: {error}")

    extraction = await extract_intents(
        state["messages"],
        {"title": state["session_title"]},
    )
    focused_intents = [
        i
        for i in extraction.intents
        if i.type in ("todo", "github_next_steps", "github_comment", "github_ack_comment")
    ]

    if focused_intents:
        engine = get_policy_engine()
        await engine.persist_and_dispatch(
            session_id=session_id,
            user_id=state["user_id"],
            undo_window_min=state["undo_window_min"],
            intents=focused_intents,
            existing_fingerprints=state["existing_fingerprints"],
        )


async def finalize_session(session_id: str, user_id: str) -> dict[str, Any]:
    """End session: final note, index, Slack summary."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
                selectinload(CaptureSession.note),
            )
            .where(CaptureSession.id == session_id, CaptureSession.userId == user_id)
        )
        session = result.scalar_one_or_none()

    if not session:
        raise RuntimeError("Session not found")

    if session.status == CaptureSessionStatus.ENDED and session.note:
        return {
            "aiSummary": session.note.aiSummary,
            "structured": session.note.structured,
        }

    messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in session.messages
    ]

    actions_data = [
        {
            "type": a.intentType.value,
            "title": (a.payload or {}).get("title") or a.intentType.value,
            "status": a.status.value,
        }
        for a in session.agentActions
    ]

    note_data = await generate_note(messages, session.userNotes, actions_data)

    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        row = session_result.scalar_one()
        row.status = CaptureSessionStatus.ENDED
        row.endedAt = datetime.now(timezone.utc)

        note_result = await db.execute(select(Note).where(Note.sessionId == session_id))
        note = note_result.scalar_one_or_none()
        if note:
            note.aiSummary = note_data["aiSummary"]
            note.structured = note_data["structured"]
        else:
            db.add(
                Note(
                    id=generate_id(),
                    sessionId=session_id,
                    aiSummary=note_data["aiSummary"],
                    structured=note_data["structured"],
                )
            )
        await db.commit()
        source_type = row.sourceType
        title = row.title

    if source_type in PIPELINE_SOURCE_TYPES:
        try:
            await index_meeting_session(
                user_id=user_id,
                session_id=session_id,
                title=title,
                ai_summary=note_data["aiSummary"],
                structured=note_data.get("structured"),
            )
        except Exception as error:
            print(f"Meeting index on end failed for {session_id}: {error}")

    try:
        from app.services.integrations.slack_approvals import post_session_ended_summary

        await post_session_ended_summary(user_id, session, note_data["aiSummary"])
    except Exception as error:
        print(f"Slack end summary failed for {session_id}: {error}")

    return note_data
