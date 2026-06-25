from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.repositories.messages import MessageRepository
from app.repositories.sessions import SessionRepository
from app.services.meeting_service import MeetingService
from app.services.session_service import SessionService


def get_session_repository(db: AsyncSession = Depends(get_db)) -> SessionRepository:
    return SessionRepository(db)


def get_message_repository(db: AsyncSession = Depends(get_db)) -> MessageRepository:
    return MessageRepository(db)


def get_session_service(
    sessions: SessionRepository = Depends(get_session_repository),
    messages: MessageRepository = Depends(get_message_repository),
) -> SessionService:
    return SessionService(sessions, messages)


def get_meeting_service(
    sessions: SessionRepository = Depends(get_session_repository),
    messages: MessageRepository = Depends(get_message_repository),
) -> MeetingService:
    return MeetingService(sessions, messages)


async def get_owned_session_or_404(
    user_id: str,
    session_id: str,
    sessions: SessionRepository = Depends(get_session_repository),
):
    capture = await sessions.get_owned(user_id, session_id)
    if not capture:
        raise HTTPException(404, "Not found")
    return capture
