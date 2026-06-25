from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import AgentAction, CaptureSession, CaptureSessionStatus, CaptureSourceType, Message, Note


class SessionRepository:
    """Data-access layer for capture sessions."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: CaptureSessionStatus | None = None,
        source_type: CaptureSourceType | None = None,
        limit: int = 50,
    ) -> list[CaptureSession]:
        stmt = select(CaptureSession).where(CaptureSession.userId == user_id)
        if status is not None:
            stmt = stmt.where(CaptureSession.status == status)
        if source_type is not None:
            stmt = stmt.where(CaptureSession.sourceType == source_type)
        result = await self._db.execute(stmt.order_by(CaptureSession.startedAt.desc()).limit(limit))
        return list(result.scalars().all())

    async def get_owned(
        self,
        user_id: str,
        session_id: str,
        *,
        load_messages: bool = False,
        load_actions: bool = False,
        load_note: bool = False,
        load_priorities: bool = False,
    ) -> CaptureSession | None:
        options = []
        if load_messages:
            options.append(selectinload(CaptureSession.messages))
        if load_actions:
            options.append(selectinload(CaptureSession.agentActions))
        if load_note:
            options.append(selectinload(CaptureSession.note))
        if load_priorities:
            options.append(selectinload(CaptureSession.priorityItems))

        stmt = select(CaptureSession).where(
            CaptureSession.id == session_id,
            CaptureSession.userId == user_id,
        )
        if options:
            stmt = stmt.options(*options)

        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_owned(self, user_id: str, session_id: str) -> CaptureSession | None:
        result = await self._db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == user_id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(
        self,
        session_id: str,
        *,
        load_messages: bool = False,
        load_actions: bool = False,
        active_only: bool = False,
    ) -> CaptureSession | None:
        options = []
        if load_messages:
            options.append(selectinload(CaptureSession.messages))
        if load_actions:
            options.append(selectinload(CaptureSession.agentActions))

        stmt = select(CaptureSession).where(CaptureSession.id == session_id)
        if active_only:
            stmt = stmt.where(CaptureSession.status == CaptureSessionStatus.ACTIVE)
        if options:
            stmt = stmt.options(*options)

        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    def add(self, capture: CaptureSession) -> CaptureSession:
        self._db.add(capture)
        return capture

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, capture: CaptureSession) -> CaptureSession:
        await self._db.refresh(capture)
        return capture

    async def delete_owned(self, user_id: str, session_id: str) -> bool:
        result = await self._db.execute(
            delete(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == user_id,
            )
        )
        await self._db.commit()
        return bool(result.rowcount)

    async def message_count(self, session_id: str) -> int:
        return int(
            await self._db.scalar(
                select(func.count()).select_from(Message).where(Message.sessionId == session_id)
            )
            or 0
        )

    async def action_count(self, session_id: str) -> int:
        return int(
            await self._db.scalar(
                select(func.count()).select_from(AgentAction).where(AgentAction.sessionId == session_id)
            )
            or 0
        )

    async def note_id_for_session(self, session_id: str) -> str | None:
        result = await self._db.execute(select(Note.id).where(Note.sessionId == session_id))
        return result.scalar_one_or_none()
