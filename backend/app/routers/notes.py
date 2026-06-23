from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.auth import AppSession, require_auth
from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    IntentType,
    Message,
    Note,
    PriorityItem,
)
from app.queue import enqueue_note_analysis
from app.services.agent.note_agent import analyze_note_for_priority
from app.services.vector.note_matcher import match_transcript_to_priorities
from app.utils import serialize_model

router = APIRouter(prefix="/api/notes", tags=["notes"])


async def _action_counts_by_session(
    db, session_ids: list[str]
) -> dict[str, dict[str, int]]:
    if not session_ids:
        return {}

    result = await db.execute(
        select(
            AgentAction.sessionId,
            AgentAction.status,
            func.count().label("count"),
        )
        .where(AgentAction.sessionId.in_(session_ids))
        .group_by(AgentAction.sessionId, AgentAction.status)
    )

    counts: dict[str, dict[str, int]] = {}
    for row in result.all():
        bucket = counts.setdefault(row.sessionId, {})
        bucket[row.status.value] = row.count
    return counts


async def _github_links_by_session(db, session_ids: list[str]) -> dict[str, int]:
    if not session_ids:
        return {}

    result = await db.execute(
        select(PriorityItem.sessionId, func.count().label("count"))
        .where(
            PriorityItem.sessionId.in_(session_ids),
            PriorityItem.sessionId.is_not(None),
        )
        .group_by(PriorityItem.sessionId)
    )
    return {row.sessionId: row.count for row in result.all()}


async def _message_counts_by_session(db, session_ids: list[str]) -> dict[str, int]:
    if not session_ids:
        return {}

    result = await db.execute(
        select(Message.sessionId, func.count().label("count"))
        .where(Message.sessionId.in_(session_ids))
        .group_by(Message.sessionId)
    )
    return {row.sessionId: row.count for row in result.all()}


@router.get("/list")
async def list_notes(
    session: AppSession = Depends(require_auth),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .where(CaptureSession.userId == session.user.id)
            .order_by(CaptureSession.startedAt.desc())
            .offset(offset)
            .limit(limit + 1)
        )
        sessions = result.scalars().all()
        has_more = len(sessions) > limit
        sessions = sessions[:limit]
        session_ids = [s.id for s in sessions]

        note_result = await db.execute(
            select(Note.sessionId).where(Note.sessionId.in_(session_ids))
        )
        summarized_ids = {row[0] for row in note_result.all()}

        action_counts = await _action_counts_by_session(db, session_ids)
        github_links = await _github_links_by_session(db, session_ids)
        message_counts = await _message_counts_by_session(db, session_ids)

        items: list[dict[str, Any]] = []
        for capture in sessions:
            actions = action_counts.get(capture.id, {})
            pending = actions.get(AgentActionStatus.PENDING.value, 0)
            auto_executed = actions.get(AgentActionStatus.AUTO_EXECUTED.value, 0)
            confirmed = actions.get(AgentActionStatus.CONFIRMED.value, 0)
            rejected = actions.get(AgentActionStatus.REJECTED.value, 0)
            failed = actions.get(AgentActionStatus.FAILED.value, 0)

            items.append(
                {
                    "id": capture.id,
                    "title": capture.title,
                    "sourceType": capture.sourceType.value,
                    "status": capture.status.value,
                    "startedAt": capture.startedAt.isoformat(),
                    "endedAt": capture.endedAt.isoformat() if capture.endedAt else None,
                    "hasSummary": capture.id in summarized_ids,
                    "pendingActions": pending,
                    "autoActions": auto_executed + confirmed,
                    "rejectedActions": rejected + failed,
                    "githubLinks": github_links.get(capture.id, 0),
                    "messageCount": message_counts.get(capture.id, 0),
                }
            )

        return {"items": items, "hasMore": has_more, "offset": offset}


async def _serialize_matches(user_id: str, matches: list) -> list[dict[str, Any]]:
    if not matches:
        return []

    item_ids = [m.priority_item_id for m in matches]
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.id.in_(item_ids),
            )
        )
        items_map = {item.id: item for item in result.scalars().all()}

    output: list[dict[str, Any]] = []
    for match in matches:
        item = items_map.get(match.priority_item_id)
        if not item:
            continue
        data = serialize_model(item)
        data["matchReason"] = match.match_reason
        data["similarity"] = round(match.similarity, 3)
        if match.excerpt:
            data["excerpt"] = match.excerpt
            data["excerptStart"] = match.excerpt_start
            data["excerptEnd"] = match.excerpt_end
        output.append(data)

    output.sort(key=lambda x: (x["priority"], -x.get("similarity", 0)))
    return output


@router.post("/match")
async def match_github_issues(
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    text = body.get("text", "")
    if not text.strip():
        return {"items": [], "suggestions": []}

    matches = await match_transcript_to_priorities(session.user.id, text)
    items = await _serialize_matches(session.user.id, matches)

    suggestions = [
        {
            "priorityItemId": item["id"],
            "externalId": item["externalId"],
            "title": item["title"],
            "excerpt": item.get("excerpt"),
            "excerptStart": item.get("excerptStart"),
            "excerptEnd": item.get("excerptEnd"),
            "similarity": item.get("similarity"),
            "matchReason": item.get("matchReason"),
        }
        for item in items
        if item.get("excerpt")
    ]

    return {"items": items, "suggestions": suggestions}


@router.post("/process")
async def process_transcript(
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    session_id = body.get("sessionId")
    note_title = body.get("title", "")
    note_content = body.get("text", "")

    if not session_id:
        raise HTTPException(400, "sessionId required")
    if not note_content.strip():
        raise HTTPException(400, "Transcript text required")

    async with AsyncSessionLocal() as db:
        capture_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == session.user.id,
            )
        )
        if not capture_result.scalar_one_or_none():
            raise HTTPException(404, "Session not found")

    matches = await match_transcript_to_priorities(session.user.id, note_content)
    items = await _serialize_matches(session.user.id, matches)

    if not items:
        return {
            "items": [],
            "suggestions": [],
            "queued": 0,
            "message": "No matching issues found in your priority inbox.",
        }

    priority_ids = [item["id"] for item in items]
    excerpts = {
        item["id"]: item["excerpt"]
        for item in items
        if item.get("excerpt")
    }

    await enqueue_note_analysis(
        user_id=session.user.id,
        session_id=session_id,
        note_title=note_title,
        note_content=note_content,
        priority_item_ids=priority_ids,
        excerpts=excerpts,
    )

    suggestions = [
        {
            "priorityItemId": item["id"],
            "externalId": item["externalId"],
            "title": item["title"],
            "excerpt": item.get("excerpt"),
            "excerptStart": item.get("excerptStart"),
            "excerptEnd": item.get("excerptEnd"),
            "similarity": item.get("similarity"),
            "matchReason": item.get("matchReason"),
        }
        for item in items
        if item.get("excerpt")
    ]

    return {
        "items": items,
        "suggestions": suggestions,
        "queued": len(priority_ids),
        "message": f"Queued {len(priority_ids)} agent job(s) in priority order.",
    }


@router.post("/analyze")
async def analyze_note(
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    session_id = body.get("sessionId")
    priority_item_id = body.get("priorityItemId")
    note_title = body.get("title", "")
    note_content = body.get("text", "")

    if not session_id or not priority_item_id:
        raise HTTPException(400, "sessionId and priorityItemId required")

    if not note_content.strip() and not note_title.strip():
        raise HTTPException(400, "Note text required for analysis")

    result = await analyze_note_for_priority(
        user_id=session.user.id,
        session_id=session_id,
        priority_item_id=priority_item_id,
        note_title=note_title,
        note_content=note_content,
    )
    if result.get("error"):
        raise HTTPException(404, result["error"])
    return result


@router.get("/actions")
async def list_note_actions(
    session_id: str,
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        capture_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == session.user.id,
            )
        )
        if not capture_result.scalar_one_or_none():
            raise HTTPException(404, "Session not found")

        result = await db.execute(
            select(AgentAction)
            .where(
                AgentAction.sessionId == session_id,
                AgentAction.intentType == IntentType.GITHUB_NEXT_STEPS,
            )
            .order_by(AgentAction.createdAt.desc())
        )
        actions = result.scalars().all()
        return [serialize_model(a) for a in actions]
