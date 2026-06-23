from typing import Any

from fastapi import APIRouter, Depends
import secrets

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSourceType, Message
from app.queue import enqueue_intent_extraction
from app.services.agent.live_notes import update_session_live_summary
from app.utils import parse_manual_transcript, serialize_model

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def new_id() -> str:
    return secrets.token_hex(12)


@router.post("/upload", status_code=201)
async def upload_meeting(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        capture = CaptureSession(
            id=new_id(),
            userId=session.user.id,
            title=body.get("title") or "Meeting upload",
            sourceType=CaptureSourceType.MEETING,
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
            await update_session_live_summary(capture.id)

        return serialize_model(capture)
