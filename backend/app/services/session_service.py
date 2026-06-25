from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSessionStatus, CaptureSourceType
from app.queue import enqueue_intent_extraction, schedule_live_notes_update
from app.repositories.messages import MessageRepository
from app.repositories.sessions import SessionRepository
from app.schemas.sessions import AppendSessionBody, CreateSessionBody, PatchSessionBody
from app.services.agent.action_executor import end_session
from app.services.vector.context import (
    get_stored_related_context,
    link_priority_to_session,
    retrieve_meeting_context,
)
from app.utils import serialize_model


class SessionService:
    """Application service for capture session workflows."""

    def __init__(self, sessions: SessionRepository, messages: MessageRepository) -> None:
        self._sessions = sessions
        self._messages = messages

    async def list_sessions(
        self,
        user_id: str,
        *,
        status: str | None = None,
        source_type: str | None = None,
    ) -> list[dict[str, Any]]:
        parsed_status = CaptureSessionStatus(status) if status else None
        parsed_source = CaptureSourceType(source_type) if source_type else None
        captures = await self._sessions.list_for_user(
            user_id,
            status=parsed_status,
            source_type=parsed_source,
        )

        output: list[dict[str, Any]] = []
        for capture in captures:
            data = serialize_model(capture)
            data["_count"] = {
                "messages": await self._sessions.message_count(capture.id),
                "agentActions": await self._sessions.action_count(capture.id),
            }
            note_id = await self._sessions.note_id_for_session(capture.id)
            data["note"] = {"id": note_id} if note_id else None
            output.append(data)
        return output

    async def create_session(self, user_id: str, body: CreateSessionBody) -> dict[str, Any]:
        capture = CaptureSession(
            id=generate_id(),
            userId=user_id,
            title=body.title or "New session",
            sourceType=CaptureSourceType(body.sourceType),
            sourceRef=body.sourceRef,
        )
        self._sessions.add(capture)
        await self._sessions.commit()
        await self._sessions.refresh(capture)

        if body.transcript:
            self._messages.add_from_transcript(capture.id, body.transcript)
            await self._sessions.commit()
            await enqueue_intent_extraction(capture.id)

        return serialize_model(capture)

    async def get_session_detail(self, user_id: str, session_id: str) -> dict[str, Any]:
        capture = await self._sessions.get_owned(
            user_id,
            session_id,
            load_messages=True,
            load_actions=True,
            load_note=True,
            load_priorities=True,
        )
        if not capture:
            raise HTTPException(404, "Not found")

        data = serialize_model(capture)
        data["messages"] = [
            serialize_model(message) for message in sorted(capture.messages, key=lambda item: item.sentAt)
        ]
        data["agentActions"] = [
            serialize_model(action)
            for action in sorted(capture.agentActions, key=lambda item: item.createdAt, reverse=True)
        ]
        data["priorityItems"] = [serialize_model(item) for item in capture.priorityItems]
        data["note"] = serialize_model(capture.note) if capture.note else None
        return data

    async def patch_session(
        self,
        user_id: str,
        session_id: str,
        body: PatchSessionBody,
    ) -> dict[str, Any]:
        if body.action == "end":
            note = await end_session(session_id, user_id)
            return {"status": "ended", "note": note}

        capture = await self._sessions.get_owned(user_id, session_id)
        if not capture:
            raise HTTPException(404, "Not found")

        fields_set = body.model_fields_set
        if "title" in fields_set:
            capture.title = body.title
        if "userNotes" in fields_set:
            capture.userNotes = body.userNotes or ""

        await self._sessions.commit()
        await self._sessions.refresh(capture)

        if "userNotes" in fields_set:
            schedule_live_notes_update(session_id)

        return serialize_model(capture)

    async def append_to_session(
        self,
        user_id: str,
        session_id: str,
        body: AppendSessionBody,
    ) -> dict[str, Any]:
        capture = await self._sessions.get_active_owned(user_id, session_id)
        if not capture:
            raise HTTPException(404, "Not found")

        if body.transcript:
            self._messages.add_from_transcript(session_id, body.transcript)
        elif body.speaker and body.content:
            self._messages.add_single(session_id, body.speaker, body.content)

        await self._sessions.commit()

        await enqueue_intent_extraction(session_id)
        schedule_live_notes_update(session_id)

        if body.source == "voice" and body.content:
            from app.services.integrations.slack_voice import notify_slack_voice_line

            await notify_slack_voice_line(
                session_id,
                str(body.speaker or "You"),
                str(body.content),
            )

        return await self._session_messages_payload(session_id)

    async def delete_session(self, user_id: str, session_id: str) -> dict[str, bool]:
        deleted = await self._sessions.delete_owned(user_id, session_id)
        if not deleted:
            raise HTTPException(404, "Not found")
        return {"success": True}

    async def get_session_context(self, user_id: str, session_id: str) -> dict[str, Any]:
        capture = await self._sessions.get_owned(user_id, session_id, load_messages=True)
        if not capture:
            raise HTTPException(404, "Not found")

        stored = get_stored_related_context(capture.metadata_)
        if stored:
            return stored

        messages = sorted(capture.messages, key=lambda item: item.sentAt, reverse=True)[:15]
        context = await retrieve_meeting_context(
            user_id=user_id,
            session_id=capture.id,
            title=capture.title,
            user_notes=capture.userNotes,
            messages=[{"speaker": message.speaker, "content": message.content} for message in reversed(messages)],
        )
        return context.model_dump() if hasattr(context, "model_dump") else context

    async def link_session_context(
        self,
        user_id: str,
        session_id: str,
        priority_item_id: str,
    ) -> dict[str, Any]:
        capture = await self._sessions.get_owned(user_id, session_id)
        if not capture:
            raise HTTPException(404, "Not found")

        await link_priority_to_session(user_id, session_id, priority_item_id)
        context = await retrieve_meeting_context(
            user_id=user_id,
            session_id=session_id,
            title=capture.title,
            user_notes=capture.userNotes,
            messages=[],
        )
        return context.model_dump() if hasattr(context, "model_dump") else context

    async def stream_session(
        self,
        user_id: str,
        session_id: str,
        request: Request,
    ) -> AsyncIterator[str]:
        capture = await self._sessions.get_owned(
            user_id,
            session_id,
            load_messages=True,
            load_actions=True,
        )
        if not capture or capture.status != CaptureSessionStatus.ACTIVE:
            raise HTTPException(404, "Session not found or ended")

        init_messages = [serialize_model(message) for message in sorted(capture.messages, key=lambda item: item.sentAt)]
        init_actions = [
            serialize_model(action)
            for action in sorted(capture.agentActions, key=lambda item: item.createdAt, reverse=True)
        ]
        related = get_stored_related_context(capture.metadata_)

        last_message_count = len(init_messages)
        last_action_count = len(init_actions)
        last_user_notes = capture.userNotes
        last_live_summary = capture.liveSummary
        last_related_key = json.dumps(related.get("updatedAt") if related else "")

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
                    .where(
                        CaptureSession.id == session_id,
                        CaptureSession.status == CaptureSessionStatus.ACTIVE,
                    )
                )
                updated = result.scalar_one_or_none()
                if not updated:
                    yield sse("end", {})
                    break

                messages = sorted(updated.messages, key=lambda item: item.sentAt)
                actions = sorted(updated.agentActions, key=lambda item: item.createdAt, reverse=True)

                if len(messages) > last_message_count:
                    yield sse(
                        "messages",
                        [serialize_model(message) for message in messages[last_message_count:]],
                    )
                    last_message_count = len(messages)

                if len(actions) > last_action_count:
                    yield sse(
                        "actions",
                        [serialize_model(action) for action in actions[: len(actions) - last_action_count]],
                    )
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

    async def _session_messages_payload(self, session_id: str) -> dict[str, Any]:
        async with AsyncSessionLocal() as db:
            sessions = SessionRepository(db)
            capture = await sessions.get_by_id(session_id, load_messages=True, load_actions=True)
            if not capture:
                raise HTTPException(404, "Not found")

            data = serialize_model(capture)
            data["messages"] = [
                serialize_model(message) for message in sorted(capture.messages, key=lambda item: item.sentAt)
            ]
            data["agentActions"] = [
                serialize_model(action)
                for action in sorted(capture.agentActions, key=lambda item: item.createdAt, reverse=True)
            ]
            return data
