from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import generate_id
from app.models import Message
from app.utils import parse_manual_transcript


class MessageRepository:
    """Data-access layer for session messages."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add_from_transcript(self, session_id: str, transcript: str) -> list[Message]:
        messages: list[Message] = []
        for parsed in parse_manual_transcript(transcript):
            message = Message(
                id=generate_id(),
                sessionId=session_id,
                speaker=parsed["speaker"],
                content=parsed["content"],
            )
            self._db.add(message)
            messages.append(message)
        return messages

    def add_single(self, session_id: str, speaker: str, content: str) -> Message:
        message = Message(
            id=generate_id(),
            sessionId=session_id,
            speaker=speaker,
            content=content,
        )
        self._db.add(message)
        return message
