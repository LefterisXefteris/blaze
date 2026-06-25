from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import CaptureSession, Recipe
from app.services.agent.extractor import run_recipe
from app.utils import serialize_model

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


@router.get("")
async def list_recipes(session: AppSession = Depends(require_auth)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe)
            .where(Recipe.userId == session.user.id)
            .order_by(Recipe.name.asc())
        )
        return [serialize_model(r) for r in result.scalars().all()]


@router.post("", status_code=201)
async def create_or_run_recipe(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    if body.get("sessionId") and body.get("recipeId"):
        async with AsyncSessionLocal() as db:
            recipe_result = await db.execute(
                select(Recipe).where(Recipe.id == body["recipeId"], Recipe.userId == session.user.id)
            )
            recipe = recipe_result.scalar_one_or_none()

            session_result = await db.execute(
                select(CaptureSession)
                .options(selectinload(CaptureSession.messages))
                .where(CaptureSession.id == body["sessionId"], CaptureSession.userId == session.user.id)
            )
            capture = session_result.scalar_one_or_none()

            if not recipe or not capture:
                raise HTTPException(404, "Not found")

            messages = sorted(capture.messages, key=lambda m: m.sentAt)
            output = await run_recipe(
                recipe.prompt,
                [
                    {"id": m.id, "speaker": m.speaker, "content": m.content, "sentAt": m.sentAt}
                    for m in messages
                ],
                capture.userNotes,
            )
            return {"output": output}

    recipe = Recipe(
        id=generate_id(),
        userId=session.user.id,
        name=body["name"],
        prompt=body["prompt"],
        description=body.get("description"),
    )
    async with AsyncSessionLocal() as db:
        db.add(recipe)
        await db.commit()
        await db.refresh(recipe)
    return serialize_model(recipe)


@router.delete("")
async def delete_recipe(id: str, session: AppSession = Depends(require_auth)):
    if not id:
        raise HTTPException(400, "id required")
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Recipe).where(Recipe.id == id, Recipe.userId == session.user.id))
        await db.commit()
    return {"success": True}
