from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import PriorityItem
from app.services.vector.indexer import index_github_session

router = APIRouter(prefix="/api/context", tags=["context"])


@router.post("/reindex")
async def reindex_context(session: AppSession = Depends(require_auth)):
    user_id = session.user.id
    indexed = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.source == "github",
                PriorityItem.status == "open",
            )
        )
        items = result.scalars().all()

    for item in items:
        if not item.sessionId:
            continue
        parts = item.externalId.split("#")
        if len(parts) < 2:
            continue
        number = int(parts[1]) if parts[1].isdigit() else 0
        if not number:
            continue

        await index_github_session(
            user_id=user_id,
            session_id=item.sessionId,
            source_ref=item.externalId,
            repo=item.repo,
            number=number,
            title=item.title,
            item_type=item.itemType,
            ai_summary=item.aiSummary,
            priority_item_id=item.id,
        )
        indexed += 1

    return {"indexed": indexed, "total": len(items)}
