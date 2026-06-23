from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import AgentAction, CaptureSession
from app.services.agent.action_executor import (
    confirm_action,
    execute_action,
    reject_action,
    undo_action,
)
from app.services.agent.coding_handoff import build_coding_handoff_markdown
from app.utils import serialize_model

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.get("")
async def list_actions(
    status: str | None = None,
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        stmt = (
            select(AgentAction)
            .join(CaptureSession, AgentAction.sessionId == CaptureSession.id)
            .options(selectinload(AgentAction.session))
            .where(CaptureSession.userId == session.user.id)
            .order_by(AgentAction.createdAt.desc())
            .limit(100)
        )
        if status:
            stmt = stmt.where(AgentAction.status == status)

        result = await db.execute(stmt)
        actions = result.scalars().all()
        output = []
        for action in actions:
            data = serialize_model(action)
            data["session"] = {"id": action.session.id, "title": action.session.title}
            output.append(data)
        return output


@router.patch("")
async def patch_action(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    action_id = body.get("actionId")
    operation = body.get("operation")
    payload = body.get("payload")

    if not action_id or not operation:
        raise HTTPException(400, "actionId and operation required")

    if operation == "confirm":
        result = await confirm_action(action_id, session.user.id, payload)
    elif operation == "reject":
        result = await reject_action(action_id, session.user.id)
    elif operation == "undo":
        result = await undo_action(action_id, session.user.id)
    elif operation == "execute":
        result = await execute_action(action_id, session.user.id)
    else:
        raise HTTPException(400, "Invalid operation")

    return result


@router.get("/{action_id}/handoff")
async def get_action_handoff(
    action_id: str,
    session: AppSession = Depends(require_auth),
):
    handoff = await build_coding_handoff_markdown(action_id, session.user.id)
    if handoff.get("error"):
        raise HTTPException(404, handoff["error"])
    return handoff
