import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import (
    ActionRevision,
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    IntentType,
    Note,
    PriorityItem,
)
from app.types import SessionMessage
from app.services.agent.extractor import generate_note
from app.services.agent.graphs.intent_graph import run_intent_graph
from app.services.integrations.github import add_issue_labels, post_issue_comment
from app.services.integrations.google_calendar import (
    create_calendar_event,
    delete_calendar_event,
)
from app.services.vector.indexer import index_meeting_session


def new_id() -> str:
    return secrets.token_hex(12)


async def process_session_intents(session_id: str) -> list[dict[str, Any]]:
    return await run_intent_graph(session_id)


async def execute_github_ack_comment(
    action_id: str,
    user_id: str,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession)
            .where(
                AgentAction.id == action_id,
                CaptureSession.userId == user_id,
                AgentAction.intentType == IntentType.GITHUB_ACK_COMMENT,
            )
        )
        action = result.scalar_one_or_none()

    if not action:
        return {"success": False, "message": "Ack action not found"}

    if action.status in (AgentActionStatus.AUTO_EXECUTED, AgentActionStatus.CONFIRMED):
        return {"success": True, "message": "Ack already posted"}

    payload = action.payload or {}
    if not payload.get("repo") or not payload.get("issueNumber") or not payload.get("body"):
        return {"success": False, "message": "Missing ack comment data"}

    try:
        comment = await post_issue_comment(
            user_id,
            payload["repo"],
            payload["issueNumber"],
            payload["body"],
        )

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            row.status = AgentActionStatus.AUTO_EXECUTED
            row.externalId = str(comment["id"])
            row.result = {
                "type": "github_ack_comment",
                "url": comment.get("html_url"),
                "status": "posted",
            }
            await db.commit()

        return {"success": True, "message": "Acknowledgment posted on GitHub"}
    except Exception as error:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            row.status = AgentActionStatus.FAILED
            row.result = {"error": str(error)}
            await db.commit()
        return {"success": False, "message": str(error)}


async def execute_action(
    action_id: str,
    user_id: str,
    undo_window_min: int = 15,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .options(selectinload(AgentAction.session))
            .join(CaptureSession)
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

    if not action:
        return {"success": False, "message": "Action not found"}

    if action.status != AgentActionStatus.PENDING:
        return {"success": False, "message": "Action already processed"}

    payload = action.payload or {}

    try:
        if action.intentType == IntentType.CALENDAR_EVENT:
            event = await create_calendar_event(
                user_id,
                {
                    "title": payload.get("title"),
                    "description": payload.get("description"),
                    "start": payload.get("start"),
                    "end": payload.get("end"),
                    "attendees": payload.get("attendees"),
                },
            )

            async with AsyncSessionLocal() as db:
                result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
                row = result.scalar_one()
                row.status = AgentActionStatus.AUTO_EXECUTED
                row.externalId = event.get("id")
                row.undoExpiresAt = datetime.now(timezone.utc) + timedelta(minutes=undo_window_min)
                row.result = event
                await db.commit()

            return {"success": True, "message": f"Calendar event created: {payload.get('title')}"}

        if action.intentType == IntentType.TODO:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
                row = result.scalar_one()
                row.status = AgentActionStatus.AUTO_EXECUTED
                row.undoExpiresAt = datetime.now(timezone.utc) + timedelta(minutes=undo_window_min)
                row.result = {
                    "type": "internal_todo",
                    "title": payload.get("title"),
                    "dueDate": payload.get("dueDate"),
                }
                await db.commit()

            return {"success": True, "message": f"Todo created: {payload.get('title')}"}

        if action.intentType in (
            IntentType.FOLLOW_UP_EMAIL,
            IntentType.TICKET,
            IntentType.CRM_UPDATE,
            IntentType.GITHUB_COMMENT,
            IntentType.GITHUB_LABEL,
        ):
            return {"success": False, "message": "Requires confirmation"}

        if action.intentType == IntentType.GITHUB_PRIORITY:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
                row = result.scalar_one()
                row.status = AgentActionStatus.AUTO_EXECUTED
                row.result = {"type": "github_priority"}
                await db.commit()
            return {"success": True, "message": "Added to priority list"}

        if action.intentType == IntentType.GITHUB_ACK_COMMENT:
            return await execute_github_ack_comment(action_id, user_id)

        return {"success": False, "message": "Unknown intent type"}

    except Exception as error:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            row.status = AgentActionStatus.FAILED
            row.result = {"error": str(error)}
            await db.commit()
        return {"success": False, "message": str(error)}


async def confirm_action(
    action_id: str,
    user_id: str,
    updated_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession)
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

    if not action or action.status != AgentActionStatus.PENDING:
        return {"success": False, "message": "Action not available for confirmation"}

    if updated_payload:
        async with AsyncSessionLocal() as db:
            db.add(
                ActionRevision(
                    id=new_id(),
                    actionId=action_id,
                    payload=updated_payload,
                )
            )
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            row.payload = updated_payload
            await db.commit()

    payload = updated_payload or action.payload or {}

    try:
        result_data: dict[str, Any] = {}

        if action.intentType == IntentType.FOLLOW_UP_EMAIL:
            result_data = {
                "type": "email_draft",
                "subject": payload.get("title"),
                "body": payload.get("description") or payload.get("title"),
                "status": "draft_ready",
            }
        elif action.intentType == IntentType.TICKET:
            result_data = {
                "type": "ticket",
                "title": payload.get("title"),
                "description": payload.get("description"),
                "status": "created",
            }
        elif action.intentType == IntentType.CRM_UPDATE:
            result_data = {
                "type": "crm_update",
                "title": payload.get("title"),
                "description": payload.get("description"),
                "status": "recorded",
            }
        elif action.intentType == IntentType.GITHUB_COMMENT:
            if not payload.get("repo") or not payload.get("issueNumber"):
                return {"success": False, "message": "Missing GitHub repo/issue"}
            comment_body = (
                payload.get("body")
                or payload.get("description")
                or payload.get("title")
            )
            comment = await post_issue_comment(
                user_id,
                payload["repo"],
                payload["issueNumber"],
                comment_body,
            )
            result_data = {
                "type": "github_comment",
                "url": comment.get("html_url"),
                "status": "posted",
            }
        elif action.intentType == IntentType.GITHUB_LABEL:
            if not payload.get("repo") or not payload.get("issueNumber") or not payload.get("labels"):
                return {"success": False, "message": "Missing GitHub label data"}
            await add_issue_labels(
                user_id,
                payload["repo"],
                payload["issueNumber"],
                payload["labels"],
            )
            result_data = {
                "type": "github_label",
                "labels": payload["labels"],
                "status": "applied",
            }
        elif action.intentType == IntentType.GITHUB_NEXT_STEPS:
            suggested = payload.get("suggestedAction") or "handoff_coding"
            if (
                suggested == "follow_up_comment"
                and payload.get("repo")
                and payload.get("issueNumber")
            ):
                body = (
                    (payload.get("draftFollowUp") or "").strip()
                    or payload.get("summary")
                    or payload.get("title")
                )
                comment = await post_issue_comment(
                    user_id,
                    payload["repo"],
                    payload["issueNumber"],
                    body,
                )
                result_data = {
                    "type": "github_follow_up",
                    "url": comment.get("html_url"),
                    "status": "posted",
                }
            elif suggested == "mark_done":
                async with AsyncSessionLocal() as db:
                    pri_result = await db.execute(
                        select(PriorityItem).where(
                            PriorityItem.userId == user_id,
                            PriorityItem.sessionId == action.sessionId,
                            PriorityItem.status == "open",
                        )
                    )
                    for item in pri_result.scalars().all():
                        item.status = "done"
                    await db.commit()
                result_data = {"type": "mark_done", "status": "completed"}
            else:
                from app.services.agent.coding_handoff import write_coding_handoff_file

                handoff = await write_coding_handoff_file(action_id, user_id)
                if handoff.get("error"):
                    return {"success": False, "message": handoff["error"]}
                result_data = {
                    "type": "coding_handoff",
                    "path": handoff.get("path"),
                    "filename": handoff.get("filename"),
                    "workspaceRoot": handoff.get("workspacePath")
                    or (handoff.get("cursorDelivery") or {}).get("workspaceRoot"),
                    "status": "ready",
                }
                cursor_delivery = handoff.get("cursorDelivery")
                if cursor_delivery:
                    result_data["cursor"] = cursor_delivery.get("cursor")
                    result_data["cursorRules"] = cursor_delivery.get("rules")
        else:
            return await execute_action(action_id, user_id, 0)

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            merged_result = dict(row.result or {})
            merged_result.update(result_data)
            row.status = AgentActionStatus.CONFIRMED
            row.result = merged_result
            await db.commit()

        try:
            from app.services.integrations.slack_approvals import refresh_slack_approval_message

            await refresh_slack_approval_message(action_id, "Approved")
        except Exception:
            pass

        return {
            "success": True,
            "message": f"{action.intentType.value} confirmed",
            "result": result_data,
        }

    except Exception as error:
        return {"success": False, "message": str(error)}


async def reject_action(action_id: str, user_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession)
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

        if not action:
            return {"success": False, "message": "Not found"}

        action.status = AgentActionStatus.REJECTED
        await db.commit()

    try:
        from app.services.integrations.slack_approvals import refresh_slack_approval_message

        await refresh_slack_approval_message(action_id, "Dismissed")
    except Exception:
        pass

    return {"success": True, "message": "Action rejected"}


async def undo_action(action_id: str, user_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession)
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

    if not action:
        return {"success": False, "message": "Not found"}

    if action.status not in (AgentActionStatus.AUTO_EXECUTED, AgentActionStatus.CONFIRMED):
        return {"success": False, "message": "Cannot undo this action"}

    if action.undoExpiresAt and action.undoExpiresAt < datetime.now(timezone.utc):
        return {"success": False, "message": "Undo window expired"}

    if action.intentType == IntentType.CALENDAR_EVENT and action.externalId:
        await delete_calendar_event(user_id, action.externalId)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
        row = result.scalar_one()
        row.status = AgentActionStatus.UNDONE
        await db.commit()

    return {"success": True, "message": "Action undone"}


async def end_session(session_id: str, user_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
            )
            .where(CaptureSession.id == session_id, CaptureSession.userId == user_id)
        )
        session = result.scalar_one_or_none()

    if not session:
        raise RuntimeError("Session not found")

    messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in session.messages
    ]

    actions_data = [
        {
            "type": a.intentType.value,
            "title": (a.payload or {}).get("title") or a.intentType.value,
            "status": a.status.value,
        }
        for a in session.agentActions
    ]

    note_data = await generate_note(messages, session.userNotes, actions_data)

    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        row = session_result.scalar_one()
        row.status = CaptureSessionStatus.ENDED
        row.endedAt = datetime.now(timezone.utc)

        note_result = await db.execute(select(Note).where(Note.sessionId == session_id))
        note = note_result.scalar_one_or_none()
        if note:
            note.aiSummary = note_data["aiSummary"]
            note.structured = note_data["structured"]
        else:
            db.add(
                Note(
                    id=new_id(),
                    sessionId=session_id,
                    aiSummary=note_data["aiSummary"],
                    structured=note_data["structured"],
                )
            )
        await db.commit()

    source_type = session.sourceType
    if source_type in (
        CaptureSourceType.MEETING,
        CaptureSourceType.SLACK,
        CaptureSourceType.MANUAL,
    ):
        try:
            await index_meeting_session(
                user_id=user_id,
                session_id=session_id,
                title=session.title,
                ai_summary=note_data["aiSummary"],
                structured=note_data.get("structured"),
            )
        except Exception as error:
            print(f"Meeting index on end failed for {session_id}: {error}")

    try:
        from app.services.integrations.slack_approvals import post_session_ended_summary

        await post_session_ended_summary(user_id, session, note_data["aiSummary"])
    except Exception as error:
        print(f"Slack end summary failed for {session_id}: {error}")

    return note_data
