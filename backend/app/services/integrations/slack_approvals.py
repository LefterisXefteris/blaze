"""Slack Block Kit approvals and live meeting notes for capture sessions."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    Integration,
    IntegrationProvider,
)
from app.config import get_settings
from app.services.agent.action_executor import confirm_action, reject_action
from app.services.integrations.slack import get_slack_client
from app.services.integrations.slack_common import (
    slack_meta as _slack_meta,
    truncate as _truncate,
    user_allows_slack_live_notes as _user_allows_slack_live_notes,
    voice_listen_hint,
)
from app.utils import app_origin

APPROVE_PREFIX = "blaze_approve"
REJECT_PREFIX = "blaze_reject"
LIVE_NOTES_MIN_INTERVAL_SEC = 30
LIVE_NOTES_PLACEHOLDER = (
    "_Taking notes… type in this thread, or open Blaze for *voice capture* "
    "(ElevenLabs Scribe when configured). Blaze summarizes key points here._"
)
APPROVAL_COMMAND = re.compile(
    r"^blaze\s+(approve|dismiss|reject)(?:\s+([a-f0-9]{6,24}))?$",
    re.IGNORECASE,
)


def _session_url(session_id: str) -> str:
    return f"{app_origin()}/sessions/{session_id}"


def _action_title(action: AgentAction) -> str:
    payload = action.payload or {}
    return payload.get("title") or action.intentType.value.replace("_", " ").title()


def _action_description(action: AgentAction) -> str:
    payload = action.payload or {}
    return (
        payload.get("description")
        or payload.get("body")
        or payload.get("summary")
        or ""
    )


async def _merge_session_slack_meta(session_id: str, updates: dict[str, Any]) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return
        meta = dict(session.metadata_ or {})
        slack = dict(meta.get("slack") or {})
        slack.update(updates)
        meta["slack"] = slack
        session.metadata_ = meta
        await db.commit()


async def _user_allows_slack_approvals(user_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()
    if not integration:
        return False
    meta = integration.metadata_ or {}
    return meta.get("slackApprovals", True) is not False


def _approval_blocks(
    action: AgentAction,
    *,
    status: str | None = None,
    outcome: str | None = None,
) -> list[dict[str, Any]]:
    title = _action_title(action)
    description = _truncate(_action_description(action), 500)
    intent = action.intentType.value.replace("_", " ").title()
    session_url = _session_url(action.sessionId)

    blocks: list[dict[str, Any]] = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*Blaze needs approval*\n"
                    f"*{title}*\n"
                    f"_{intent}_ · confidence {int(action.confidence * 100)}%"
                ),
            },
        },
    ]

    if description:
        blocks.append(
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": _truncate(description, 2000)},
            }
        )

    if status == AgentActionStatus.PENDING.value:
        blocks.append(
            {
                "type": "actions",
                "block_id": f"blaze_actions_{action.id}",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Approve"},
                        "style": "primary",
                        "action_id": f"{APPROVE_PREFIX}:{action.id}",
                        "value": action.id,
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Dismiss"},
                        "style": "danger",
                        "action_id": f"{REJECT_PREFIX}:{action.id}",
                        "value": action.id,
                    },
                ],
            }
        )
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"<{_session_url(action.sessionId)}|Open in Blaze> · "
                        "or reply `blaze approve` / `blaze dismiss`",
                    }
                ],
            }
        )
    else:
        label = outcome or (status or "updated").replace("_", " ").title()
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"*{label}* · <{session_url}|View session>",
                    }
                ],
            }
        )

    return blocks


def _live_notes_blocks(session: CaptureSession, summary: str) -> list[dict[str, Any]]:
    title = session.title or "Live meeting"
    body = summary.strip() or LIVE_NOTES_PLACEHOLDER
    trimmed = _truncate(body, 2800)
    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📝 Blaze live notes"},
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{title}*\n{trimmed}",
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        f"<{_session_url(session.id)}|Open in Blaze> · "
                        "updates as the meeting unfolds"
                    ),
                }
            ],
        },
    ]


async def _resolve_blaze_user_for_slack(slack_user_id: str, team_id: str | None) -> str | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(Integration.provider == IntegrationProvider.SLACK)
        )
        for integration in result.scalars().all():
            meta = integration.metadata_ or {}
            if meta.get("slackUserId") != slack_user_id:
                continue
            if team_id and meta.get("teamId") != team_id:
                continue
            return integration.userId
    return None


async def post_session_started_notice(session: CaptureSession) -> None:
    if session.sourceType != CaptureSourceType.SLACK or not session.sourceRef:
        return
    if not await _user_allows_slack_live_notes(session.userId):
        return

    client = await get_slack_client(session.userId)
    if not client:
        return

    huddle = (session.metadata_ or {}).get("huddle")
    slack_meta = _slack_meta(session)
    thread_ts = slack_meta.get("huddleThreadTs")
    kind = "huddle" if huddle else "meeting"

    try:
        client.conversations_join(channel=session.sourceRef)
    except Exception:
        pass

    blocks = _live_notes_blocks(session, session.liveSummary or "")
    settings = get_settings()
    blocks.append(
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": voice_listen_hint(
                        elevenlabs_configured=bool(settings.elevenlabs_api_key),
                        session_id=session.id,
                    ),
                }
            ],
        }
    )
    text = f"Blaze live notes · {session.title or kind}"

    post_kwargs: dict[str, Any] = {
        "channel": session.sourceRef,
        "text": text,
        "blocks": blocks,
    }
    if thread_ts:
        post_kwargs["thread_ts"] = thread_ts

    try:
        response = client.chat_postMessage(**post_kwargs)
        ts = response.get("ts")
        if ts:
            await _merge_session_slack_meta(
                session.id,
                {
                    "startedMessageTs": ts,
                    "liveNotesMessageTs": ts,
                    "lastLiveNotesPost": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as error:
        print(f"Slack session start notice failed for {session.id}: {error}")

    try:
        from app.services.integrations.slack_canvas_notes import (
            post_canvas_open_hint,
            sync_live_notes_canvas,
        )

        await sync_live_notes_canvas(session, session.liveSummary or "")
        await post_canvas_open_hint(session, thread_ts=thread_ts)
    except Exception as error:
        print(f"Slack canvas notes failed for {session.id}: {error}")


async def notify_pending_action(user_id: str, session_id: str, action_id: str) -> None:
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()
        action_result = await db.execute(
            select(AgentAction).where(AgentAction.id == action_id)
        )
        action = action_result.scalar_one_or_none()

    if (
        not session
        or not action
        or session.sourceType != CaptureSourceType.SLACK
        or not session.sourceRef
        or action.status != AgentActionStatus.PENDING
    ):
        return

    if not await _user_allows_slack_approvals(user_id):
        return

    client = await get_slack_client(user_id)
    if not client:
        return

    blocks = _approval_blocks(action, status=AgentActionStatus.PENDING.value)
    try:
        response = client.chat_postMessage(
            channel=session.sourceRef,
            text=f"Blaze needs approval: {_action_title(action)}",
            blocks=blocks,
        )
        ts = response.get("ts")
        if not ts:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(AgentAction).where(AgentAction.id == action_id))
            row = result.scalar_one()
            existing = dict(row.result or {})
            existing["slackApproval"] = {
                "channelId": session.sourceRef,
                "messageTs": ts,
            }
            row.result = existing
            await db.commit()
    except Exception as error:
        print(f"Slack approval post failed for action {action_id}: {error}")


async def refresh_slack_approval_message(action_id: str, outcome: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .options(selectinload(AgentAction.session))
            .where(AgentAction.id == action_id)
        )
        action = result.scalar_one_or_none()

    if not action:
        return

    slack_info = (action.result or {}).get("slackApproval")
    if not slack_info:
        return

    client = await get_slack_client(action.session.userId)
    if not client:
        return

    status = action.status.value if hasattr(action.status, "value") else str(action.status)
    blocks = _approval_blocks(action, status=status, outcome=outcome)

    try:
        client.chat_update(
            channel=slack_info["channelId"],
            ts=slack_info["messageTs"],
            text=f"Blaze action {outcome}: {_action_title(action)}",
            blocks=blocks,
        )
    except Exception as error:
        print(f"Slack approval update failed for {action_id}: {error}")


async def post_or_update_live_notes(session_id: str, summary: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if (
        not session
        or session.status != CaptureSessionStatus.ACTIVE
        or session.sourceType != CaptureSourceType.SLACK
        or not session.sourceRef
    ):
        return

    if not await _user_allows_slack_live_notes(session.userId):
        return

    slack_meta = _slack_meta(session)
    message_ts = slack_meta.get("liveNotesMessageTs")

    if not message_ts:
        last_post = None
    else:
        last_post = slack_meta.get("lastLiveNotesPost")

    if last_post and message_ts:
        try:
            last_dt = datetime.fromisoformat(str(last_post).replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            if elapsed < LIVE_NOTES_MIN_INTERVAL_SEC:
                return
        except Exception:
            pass

    client = await get_slack_client(session.userId)
    if not client:
        return

    note_body = summary.strip() or session.liveSummary.strip() or LIVE_NOTES_PLACEHOLDER
    blocks = _live_notes_blocks(session, note_body)
    text = f"Live notes · {session.title or 'meeting'}"
    thread_ts = slack_meta.get("huddleThreadTs")

    try:
        if message_ts:
            client.chat_update(
                channel=session.sourceRef,
                ts=message_ts,
                text=text,
                blocks=blocks,
            )
        else:
            post_kwargs: dict[str, Any] = {
                "channel": session.sourceRef,
                "text": text,
                "blocks": blocks,
            }
            if thread_ts:
                post_kwargs["thread_ts"] = thread_ts
            response = client.chat_postMessage(**post_kwargs)
            message_ts = response.get("ts")

        if message_ts:
            await _merge_session_slack_meta(
                session_id,
                {
                    "liveNotesMessageTs": message_ts,
                    "lastLiveNotesPost": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception as error:
        print(f"Slack live notes post failed for {session_id}: {error}")

    try:
        from app.services.integrations.slack_canvas_notes import sync_live_notes_canvas

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CaptureSession).where(CaptureSession.id == session_id)
            )
            fresh = result.scalar_one_or_none()
        if fresh:
            await sync_live_notes_canvas(fresh, note_body)
    except Exception as error:
        print(f"Slack canvas update failed for {session_id}: {error}")


async def post_session_ended_summary(
    user_id: str,
    session: CaptureSession,
    ai_summary: str,
) -> None:
    if session.sourceType != CaptureSourceType.SLACK or not session.sourceRef:
        return
    if not await _user_allows_slack_live_notes(user_id):
        return

    client = await get_slack_client(user_id)
    if not client:
        return

    title = session.title or "Meeting"
    text = f"Meeting ended · {title}"
    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"*Meeting ended · {title}*\n"
                    f"{_truncate(ai_summary, 2500)}\n\n"
                    f"<{_session_url(session.id)}|Read full notes in Blaze>"
                ),
            },
        }
    ]

    try:
        client.chat_postMessage(channel=session.sourceRef, text=text, blocks=blocks)
    except Exception as error:
        print(f"Slack end summary failed for {session.id}: {error}")


async def _latest_pending_action(session_id: str) -> AgentAction | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .where(
                AgentAction.sessionId == session_id,
                AgentAction.status == AgentActionStatus.PENDING,
            )
            .order_by(AgentAction.createdAt.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


async def try_handle_approval_command(
    channel_id: str,
    slack_user_id: str,
    text: str,
    team_id: str | None = None,
) -> bool:
    match = APPROVAL_COMMAND.match((text or "").strip())
    if not match:
        return False

    blaze_user_id = await _resolve_blaze_user_for_slack(slack_user_id, team_id)
    if not blaze_user_id:
        return False

    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.userId == blaze_user_id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
                CaptureSession.sourceType == CaptureSourceType.SLACK,
                CaptureSession.sourceRef == channel_id,
            )
        )
        session = session_result.scalar_one_or_none()

    if not session:
        return False

    action_id_hint = match.group(2)
    verb = match.group(1).lower()

    async with AsyncSessionLocal() as db:
        if action_id_hint:
            result = await db.execute(
                select(AgentAction).where(
                    AgentAction.sessionId == session.id,
                    AgentAction.id.contains(action_id_hint),
                    AgentAction.status == AgentActionStatus.PENDING,
                )
            )
            action = result.scalar_one_or_none()
        else:
            action = await _latest_pending_action(session.id)

    if not action:
        client = await get_slack_client(blaze_user_id)
        if client:
            try:
                client.chat_postEphemeral(
                    channel=channel_id,
                    user=slack_user_id,
                    text="No pending Blaze actions to approve in this meeting.",
                )
            except Exception:
                pass
        return True

    if verb == "approve":
        result = await confirm_action(action.id, blaze_user_id)
        outcome = "Approved" if result.get("success") else result.get("message", "Failed")
    else:
        result = await reject_action(action.id, blaze_user_id)
        outcome = "Dismissed" if result.get("success") else result.get("message", "Failed")

    if result.get("success"):
        await refresh_slack_approval_message(action.id, outcome)

    client = await get_slack_client(blaze_user_id)
    if client:
        try:
            client.chat_postEphemeral(
                channel=channel_id,
                user=slack_user_id,
                text=f"Blaze: {outcome} — {_action_title(action)}",
            )
        except Exception:
            pass

    return True


async def handle_slack_interaction(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("type") != "block_actions":
        return {}

    team_id = (payload.get("team") or {}).get("id")
    slack_user_id = (payload.get("user") or {}).get("id")
    if not slack_user_id:
        return {}

    blaze_user_id = await _resolve_blaze_user_for_slack(slack_user_id, team_id)
    if not blaze_user_id:
        return {
            "response_type": "ephemeral",
            "text": "Connect Blaze to Slack in Settings to approve actions here.",
        }

    for action_payload in payload.get("actions") or []:
        action_id_value = action_payload.get("value") or ""
        action_key = action_payload.get("action_id") or ""

        if action_key.startswith(f"{APPROVE_PREFIX}:"):
            result = await confirm_action(action_id_value, blaze_user_id)
            outcome = "Approved" if result.get("success") else result.get("message", "Failed")
            if result.get("success"):
                await refresh_slack_approval_message(action_id_value, outcome)
            return {"response_type": "ephemeral", "text": f"Blaze: {outcome}"}

        if action_key.startswith(f"{REJECT_PREFIX}:"):
            result = await reject_action(action_id_value, blaze_user_id)
            outcome = "Dismissed" if result.get("success") else result.get("message", "Failed")
            if result.get("success"):
                await refresh_slack_approval_message(action_id_value, outcome)
            return {"response_type": "ephemeral", "text": f"Blaze: {outcome}"}

    return {}
