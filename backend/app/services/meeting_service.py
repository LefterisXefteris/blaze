from __future__ import annotations

from app.core.ids import generate_id
from app.models import CaptureSession, CaptureSourceType
from app.queue import enqueue_intent_extraction
from app.repositories.messages import MessageRepository
from app.repositories.sessions import SessionRepository
from app.schemas.meetings import UploadMeetingBody
from app.services.agent.live_notes import update_session_live_summary
from app.utils import serialize_model


class MeetingService:
    """Application service for meeting uploads."""

    def __init__(self, sessions: SessionRepository, messages: MessageRepository) -> None:
        self._sessions = sessions
        self._messages = messages

    async def upload_meeting(self, user_id: str, body: UploadMeetingBody) -> dict[str, Any]:
        capture = CaptureSession(
            id=generate_id(),
            userId=user_id,
            title=body.title or "Meeting upload",
            sourceType=CaptureSourceType.MEETING,
        )
        self._sessions.add(capture)
        await self._sessions.commit()
        await self._sessions.refresh(capture)

        if body.transcript:
            self._messages.add_from_transcript(capture.id, body.transcript)
            await self._sessions.commit()
            await enqueue_intent_extraction(capture.id)
            await update_session_live_summary(capture.id)

        return serialize_model(capture)
