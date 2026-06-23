import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal, get_db
from app.models import (
    AgentAction,
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    Message,
    Note,
)
from app.queue import enqueue_intent_extraction, schedule_live_notes_update
from app.services.agent.action_executor import end_session
from app.services.vector.context import (
    get_stored_related_context,
    link_priority_to_session,
    retrieve_meeting_context,
)
from app.utils import parse_manual_transcript, serialize_model
import secrets

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def new_id() -> str:
    return secrets.token_hex(12)


@router.get("")
async def list_sessions(session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .where(CaptureSession.userId == session.user.id)
            .order_by(CaptureSession.startedAt.desc())
            .limit(50)
        )
        sessions = result.scalars().all()
        output = []
        for s in sessions:
            msg_count = await db.scalar(
                select(func.count()).select_from(Message).where(Message.sessionId == s.id)
            )
            action_count = await db.scalar(
                select(func.count()).select_from(AgentAction).where(AgentAction.sessionId == s.id)
            )
            note_result = await db.execute(select(Note.id).where(Note.sessionId == s.id))
            note_id = note_result.scalar_one_or_none()
            data = serialize_model(s)
            data["_count"] = {"messages": msg_count or 0, "agentActions": action_count or 0}
            data["note"] = {"id": note_id} if note_id else None
            output.append(data)
        return output


@router.post("", status_code=201)
async def create_session(
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        capture = CaptureSession(
            id=new_id(),
            userId=session.user.id,
            title=body.get("title") or "New session",
            sourceType=CaptureSourceType(body.get("sourceType", "MANUAL")),
            sourceRef=body.get("sourceRef"),
        )
        db.add(capture)
        await db.commit()
        await db.refresh(capture)

        transcript = body.get("transcript")
        if transcript:
            for msg in parse_manual_transcript(transcript):
                db.add(
                    Message(
                        id=new_id(),
                        sessionId=capture.id,
                        speaker=msg["speaker"],
                        content=msg["content"],
                    )
                )
            await db.commit()
            await enqueue_intent_extraction(capture.id)

        return serialize_model(capture)


@router.get("/{session_id}")
async def get_session(session_id: str, session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
                selectinload(CaptureSession.note),
            )
            .where(CaptureSession.id == session_id, CaptureSession.userId == session.user.id)
        )
        capture = result.scalar_one_or_none()
        if not capture:
            raise HTTPException(404, "Not found")

        data = serialize_model(capture)
        data["messages"] = [serialize_model(m) for m in sorted(capture.messages, key=lambda x: x.sentAt)]
        data["agentActions"] = [
            serialize_model(a) for a in sorted(capture.agentActions, key=lambda x: x.createdAt, reverse=True)
        ]
        data["note"] = serialize_model(capture.note) if capture.note else None
        return data


@router.patch("/{session_id}")
async def patch_session(
    session_id: str,
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id, CaptureSession.userId == session.user.id
            )
        )
        existing = result.scalar_one_or_none()
        if not existing:
            raise HTTPException(404, "Not found")

        if body.get("action") == "end":
            note = await end_session(session_id, session.user.id)
            return {"status": "ended", "note": note}

        if "title" in body:
            existing.title = body["title"]
        if "userNotes" in body:
            existing.userNotes = body["userNotes"]
        await db.commit()
        await db.refresh(existing)

        if "userNotes" in body:
            schedule_live_notes_update(session_id)

        return serialize_model(existing)


@router.post("/{session_id}")
async def append_to_session(
    session_id: str,
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == session.user.id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
            )
        )
        existing = result.scalar_one_or_none()
        if not existing:
            raise HTTPException(404, "Not found")

        if body.get("transcript"):
            for msg in parse_manual_transcript(body["transcript"]):
                db.add(
                    Message(
                        id=new_id(),
                        sessionId=session_id,
                        speaker=msg["speaker"],
                        content=msg["content"],
                    )
                )
        elif body.get("speaker") and body.get("content"):
            db.add(
                Message(
                    id=new_id(),
                    sessionId=session_id,
                    speaker=body["speaker"],
                    content=body["content"],
                )
            )
        await db.commit()

    await enqueue_intent_extraction(session_id)
    schedule_live_notes_update(session_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
            )
            .where(CaptureSession.id == session_id)
        )
        capture = result.scalar_one()
        data = serialize_model(capture)
        data["messages"] = [serialize_model(m) for m in sorted(capture.messages, key=lambda x: x.sentAt)]
        data["agentActions"] = [
            serialize_model(a) for a in sorted(capture.agentActions, key=lambda x: x.createdAt, reverse=True)
        ]
        return data


@router.delete("/{session_id}")
async def delete_session(session_id: str, session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(CaptureSession).where(
                CaptureSession.id == session_id, CaptureSession.userId == session.user.id
            )
        )
        await db.commit()
    return {"success": True}


@router.get("/{session_id}/stream")
async def stream_session(session_id: str, request: Request, session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
            )
            .where(CaptureSession.id == session_id, CaptureSession.userId == session.user.id)
        )
        capture = result.scalar_one_or_none()
        if not capture or capture.status != CaptureSessionStatus.ACTIVE:
            raise HTTPException(404, "Session not found or ended")

        init_messages = [serialize_model(m) for m in sorted(capture.messages, key=lambda x: x.sentAt)]
        init_actions = [serialize_model(a) for a in sorted(capture.agentActions, key=lambda x: x.createdAt, reverse=True)]
        related = get_stored_related_context(capture.metadata_)

    last_message_count = len(init_messages)
    last_action_count = len(init_actions)
    last_user_notes = capture.userNotes
    last_live_summary = capture.liveSummary
    last_related_key = json.dumps(related.get("updatedAt") if related else "")

    async def event_generator():
        nonlocal last_message_count, last_action_count, last_user_notes, last_live_summary, last_related_key

        def sse(event: str, data: Any) -> str:
            return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"

        yield sse(
            "init",
            {
                "messages": init_messages,
                "actions": init_actions,
                "userNotes": last_user_notes,
                "liveSummary": last_live_summary,
                "relatedContext": related,
            },
        )

        while True:
            if await request.is_disconnected():
                break
            await asyncio.sleep(2)

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(CaptureSession)
                    .options(
                        selectinload(CaptureSession.messages),
                        selectinload(CaptureSession.agentActions),
                    )
                    .where(CaptureSession.id == session_id, CaptureSession.status == CaptureSessionStatus.ACTIVE)
                )
                updated = result.scalar_one_or_none()
                if not updated:
                    yield sse("end", {})
                    break

                messages = sorted(updated.messages, key=lambda x: x.sentAt)
                actions = sorted(updated.agentActions, key=lambda x: x.createdAt, reverse=True)

                if len(messages) > last_message_count:
                    yield sse("messages", [serialize_model(m) for m in messages[last_message_count:]])
                    last_message_count = len(messages)

                if len(actions) > last_action_count:
                    yield sse("actions", [serialize_model(a) for a in actions[: len(actions) - last_action_count]])
                    last_action_count = len(actions)

                if updated.userNotes != last_user_notes:
                    yield sse("notes", {"userNotes": updated.userNotes})
                    last_user_notes = updated.userNotes

                if updated.liveSummary != last_live_summary:
                    yield sse("liveSummary", {"liveSummary": updated.liveSummary})
                    last_live_summary = updated.liveSummary

                related_ctx = get_stored_related_context(updated.metadata_)
                related_key = json.dumps(related_ctx.get("updatedAt") if related_ctx else "")
                if related_key != last_related_key:
                    yield sse("relatedContext", related_ctx)
                    last_related_key = related_key

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/{session_id}/context")
async def get_session_context(session_id: str, session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(selectinload(CaptureSession.messages))
            .where(CaptureSession.id == session_id, CaptureSession.userId == session.user.id)
        )
        capture = result.scalar_one_or_none()
        if not capture:
            raise HTTPException(404, "Not found")

        stored = get_stored_related_context(capture.metadata_)
        if stored:
            return stored

        messages = sorted(capture.messages, key=lambda x: x.sentAt, reverse=True)[:15]
        context = await retrieve_meeting_context(
            user_id=session.user.id,
            session_id=capture.id,
            title=capture.title,
            user_notes=capture.userNotes,
            messages=[{"speaker": m.speaker, "content": m.content} for m in reversed(messages)],
        )
        return context.model_dump() if hasattr(context, "model_dump") else context


@router.post("/{session_id}/context")
async def link_session_context(
    session_id: str,
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    priority_item_id = body.get("priorityItemId")
    if not priority_item_id:
        raise HTTPException(400, "priorityItemId required")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id, CaptureSession.userId == session.user.id
            )
        )
        capture = result.scalar_one_or_none()
        if not capture:
            raise HTTPException(404, "Not found")

    await link_priority_to_session(session.user.id, session_id, priority_item_id)
    context = await retrieve_meeting_context(
        user_id=session.user.id,
        session_id=session_id,
        title=capture.title,
        user_notes=capture.userNotes,
        messages=[],
    )
    return context.model_dump() if hasattr(context, "model_dump") else context
