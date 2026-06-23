from fastapi import APIRouter, Depends
from sqlalchemy import or_, select

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import CaptureSession, Message, Note, PriorityItem
from app.services.vector.search import search_context
from app.utils import serialize_model

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(q: str | None = None, semantic: bool = False, session: AppSession = Depends(require_auth)):
    if not q or not q.strip():
        return []

    query = q.strip()
    user_id = session.user.id

    async with AsyncSessionLocal() as db:
        sessions_result = await db.execute(
            select(CaptureSession)
            .where(
                CaptureSession.userId == user_id,
                or_(
                    CaptureSession.title.ilike(f"%{query}%"),
                    CaptureSession.userNotes.ilike(f"%{query}%"),
                ),
            )
            .limit(10)
        )
        sessions = [
            {
                "id": s.id,
                "title": s.title,
                "startedAt": s.startedAt.isoformat() if s.startedAt else None,
                "status": s.status.value if hasattr(s.status, "value") else s.status,
            }
            for s in sessions_result.scalars().all()
        ]

        notes_result = await db.execute(
            select(Note)
            .join(CaptureSession, Note.sessionId == CaptureSession.id)
            .where(Note.aiSummary.ilike(f"%{query}%"), CaptureSession.userId == user_id)
            .limit(10)
        )
        notes = []
        for note in notes_result.scalars().all():
            cap_result = await db.execute(select(CaptureSession).where(CaptureSession.id == note.sessionId))
            cap = cap_result.scalar_one()
            notes.append(
                {
                    "id": note.id,
                    "aiSummary": note.aiSummary,
                    "session": {"id": cap.id, "title": cap.title},
                }
            )

        messages_result = await db.execute(
            select(Message)
            .join(CaptureSession, Message.sessionId == CaptureSession.id)
            .where(Message.content.ilike(f"%{query}%"), CaptureSession.userId == user_id)
            .limit(10)
        )
        messages = []
        for msg in messages_result.scalars().all():
            cap_result = await db.execute(select(CaptureSession).where(CaptureSession.id == msg.sessionId))
            cap = cap_result.scalar_one()
            messages.append(
                {
                    "id": msg.id,
                    "content": msg.content,
                    "speaker": msg.speaker,
                    "session": {"id": cap.id, "title": cap.title},
                }
            )

        priority_result = await db.execute(
            select(PriorityItem)
            .where(
                PriorityItem.userId == user_id,
                or_(
                    PriorityItem.title.ilike(f"%{query}%"),
                    PriorityItem.repo.ilike(f"%{query}%"),
                    PriorityItem.aiSummary.ilike(f"%{query}%"),
                ),
            )
            .limit(10)
        )
        priority_items = [
            {
                "id": p.id,
                "title": p.title,
                "repo": p.repo,
                "externalUrl": p.externalUrl,
                "priority": p.priority,
                "status": p.status,
            }
            for p in priority_result.scalars().all()
        ]

    semantic_hits = None
    if semantic:
        hits = await search_context(user_id=user_id, query=query, top_k=8)
        semantic_hits = [h.model_dump() if hasattr(h, "model_dump") else h for h in hits]

    return {
        "sessions": sessions,
        "notes": notes,
        "messages": messages,
        "priorityItems": priority_items,
        "semanticHits": semantic_hits,
    }
