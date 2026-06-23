from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import PriorityItem
from app.services.integrations.github import update_github_settings
from app.utils import serialize_model

router = APIRouter(prefix="/api/priority", tags=["priority"])


@router.get("")
async def list_priority(status: str = "open", session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem)
            .options(selectinload(PriorityItem.session))
            .where(PriorityItem.userId == session.user.id, PriorityItem.status == status)
            .order_by(PriorityItem.priority.asc(), PriorityItem.createdAt.desc())
            .limit(100)
        )
        items = result.scalars().all()
        output = []
        for item in items:
            data = serialize_model(item)
            data["session"] = (
                {"id": item.session.id, "title": item.session.title} if item.session else None
            )
            output.append(data)
        return output


@router.patch("")
async def patch_priority(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    item_id = body.get("id")
    if not item_id:
        raise HTTPException(400, "id required")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(PriorityItem.id == item_id, PriorityItem.userId == session.user.id)
        )
        existing = result.scalar_one_or_none()
        if not existing:
            raise HTTPException(404, "Not found")

        if "status" in body:
            existing.status = body["status"]
        if "priority" in body:
            existing.priority = body["priority"]
        if body.get("snoozedUntil"):
            metadata = existing.metadata_ or {}
            metadata["snoozedUntil"] = body["snoozedUntil"]
            existing.metadata_ = metadata
            existing.status = "snoozed"

        await db.commit()
        await db.refresh(existing)
        return serialize_model(existing)


@router.post("")
async def post_priority(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    if body.get("settings"):
        await update_github_settings(session.user.id, body["settings"])
        return {"success": True}
    raise HTTPException(400, "Invalid request")
