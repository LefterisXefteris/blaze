from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.ids import generate_id

from app.database import AsyncSessionLocal
from app.models import (
    ActionRevision,
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    IntentType,
    PriorityItem,
)
from app.services.integrations.adapters import get_adapter
from app.services.integrations.github import add_issue_labels
from app.services.integrations.google_calendar import delete_calendar_event


async def process_session_intents(session_id: str) -> list[dict[str, Any]]:
    from app.services.agent.blaze_pipeline import process_session

    await process_session(session_id)
    return []


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
        comment = await get_adapter("GITHUB").post_issue_comment(
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
            event = await get_adapter("GOOGLE_CALENDAR").create_calendar_event(
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
                    id=generate_id(),
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
            comment = await get_adapter("GITHUB").post_issue_comment(
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
                comment = await get_adapter("GITHUB").post_issue_comment(
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
    action_snapshot: dict[str, str] | None = None

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession)
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

        if not action:
            return {"success": False, "message": "Not found"}

        payload = action.payload or {}
        action_snapshot = {
            "trace_id": payload.get("langfuseTraceId"),
            "session_id": action.sessionId,
            "intent_type": action.intentType.value,
            "title": str(payload.get("title") or action.intentType.value),
        }

        action.status = AgentActionStatus.REJECTED
        await db.commit()

    if action_snapshot:
        from app.services.llm.observability import record_action_rejection_score

        record_action_rejection_score(
            trace_id=action_snapshot["trace_id"],
            action_id=action_id,
            session_id=action_snapshot["session_id"],
            intent_type=action_snapshot["intent_type"],
            title=action_snapshot["title"],
        )

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
    from app.services.agent.blaze_pipeline import finalize_session

    return await finalize_session(session_id, user_id)
