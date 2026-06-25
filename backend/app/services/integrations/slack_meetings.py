from typing import Any

from sqlalchemy import select

from app.core.ids import generate_id

from app.database import AsyncSessionLocal
from app.models import (
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    Integration,
    IntegrationProvider,
    Message,
)
from app.services.agent.action_executor import end_session
from app.services.agent.live_notes import update_session_live_summary
from app.services.integrations.slack import fetch_channel_history, get_slack_client


async def get_slack_channel_label(user_id: str, channel_id: str) -> str:
    client = await get_slack_client(user_id)
    if not client:
        return channel_id

    try:
        info = client.conversations_info(channel=channel_id)
        channel = info.get("channel")
        if not channel:
            return channel_id
        if channel.get("is_im"):
            return "DM"
        return f"#{channel.get('name')}" if channel.get("name") else channel_id
    except Exception:
        return channel_id


async def _users_for_slack_team(team_id: str) -> list[Integration]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(Integration.provider == IntegrationProvider.SLACK)
        )
        integrations = result.scalars().all()

    return [
        i
        for i in integrations
        if (i.metadata_ or {}).get("teamId") == team_id
    ]


async def start_slack_meeting_session(
    user_id: str,
    channel_id: str,
    title: str | None = None,
    huddle: bool = False,
    auto_started: bool = False,
    huddle_thread_ts: str | None = None,
    huddle_room_id: str | None = None,
) -> CaptureSession:
    async with AsyncSessionLocal() as db:
        existing_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.userId == user_id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
                CaptureSession.sourceType == CaptureSourceType.SLACK,
                CaptureSession.sourceRef == channel_id,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            if huddle_thread_ts or huddle_room_id:
                meta = dict(existing.metadata_ or {})
                slack = dict(meta.get("slack") or {})
                if huddle_thread_ts:
                    slack["huddleThreadTs"] = huddle_thread_ts
                if huddle_room_id:
                    slack["huddleRoomId"] = huddle_room_id
                meta["slack"] = slack
                existing.metadata_ = meta
                await db.commit()
                await db.refresh(existing)

            slack_meta = (existing.metadata_ or {}).get("slack") or {}
            if not slack_meta.get("liveNotesMessageTs"):
                try:
                    from app.services.integrations.slack_approvals import (
                        post_session_started_notice,
                    )

                    await post_session_started_notice(existing)
                except Exception as error:
                    print(
                        f"Slack live notes panel failed for {existing.id}: {error}"
                    )
            return existing

    channel_label = await get_slack_channel_label(user_id, channel_id)
    session_title = title or (
        f"Slack huddle · {channel_label}" if huddle else f"Slack meeting · {channel_label}"
    )

    session_meta: dict[str, Any] = {
        "huddle": huddle,
        "autoStarted": auto_started,
        "channelLabel": channel_label,
    }
    if huddle_thread_ts or huddle_room_id:
        session_meta["slack"] = {
            **({"huddleThreadTs": huddle_thread_ts} if huddle_thread_ts else {}),
            **({"huddleRoomId": huddle_room_id} if huddle_room_id else {}),
        }

    async with AsyncSessionLocal() as db:
        capture_session = CaptureSession(
            id=generate_id(),
            userId=user_id,
            title=session_title,
            sourceType=CaptureSourceType.SLACK,
            sourceRef=channel_id,
            metadata_=session_meta,
        )
        db.add(capture_session)
        await db.flush()

        history = await fetch_channel_history(user_id, channel_id, 30)
        for msg in history:
            db.add(
                Message(
                    id=generate_id(),
                    sessionId=capture_session.id,
                    externalId=msg["externalId"],
                    speaker=msg["speaker"],
                    content=msg["content"],
                    sentAt=msg["sentAt"],
                )
            )
        await db.commit()
        await db.refresh(capture_session)

    await update_session_live_summary(capture_session.id)

    try:
        from app.services.integrations.slack_approvals import post_session_started_notice

        await post_session_started_notice(capture_session)
    except Exception as error:
        print(f"Slack start notice failed for {capture_session.id}: {error}")

    return capture_session


async def handle_slack_huddle_started(
    team_id: str,
    channel_id: str,
    huddle_thread_ts: str | None = None,
    huddle_room_id: str | None = None,
) -> list[str]:
    integrations = await _users_for_slack_team(team_id)
    started: list[str] = []

    for integration in integrations:
        meta = integration.metadata_ or {}
        if meta.get("autoHuddleCapture") is False:
            continue

        session = await start_slack_meeting_session(
            integration.userId,
            channel_id,
            huddle=True,
            auto_started=True,
            huddle_thread_ts=huddle_thread_ts,
            huddle_room_id=huddle_room_id,
        )
        started.append(session.id)

    return started


async def handle_slack_huddle_ended(team_id: str, channel_id: str) -> None:
    integrations = await _users_for_slack_team(team_id)

    for integration in integrations:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CaptureSession).where(
                    CaptureSession.userId == integration.userId,
                    CaptureSession.status == CaptureSessionStatus.ACTIVE,
                    CaptureSession.sourceType == CaptureSourceType.SLACK,
                    CaptureSession.sourceRef == channel_id,
                )
            )
            active_sessions = result.scalars().all()

        for session in active_sessions:
            try:
                await end_session(session.id, integration.userId)
            except Exception as error:
                print(f"Failed to end session {session.id}: {error}")


def _huddle_room_ended(room: dict[str, Any]) -> bool:
    if room.get("has_ended"):
        return True
    date_end = room.get("date_end") or 0
    return isinstance(date_end, (int, float)) and date_end > 0


async def handle_slack_huddle_thread(
    team_id: str,
    channel_id: str,
    room: dict[str, Any],
    message_ts: str | None = None,
) -> list[str] | None:
    """Handle message events with subtype huddle_thread (modern Slack huddle API)."""
    thread_ts = (
        room.get("thread_root_ts")
        or room.get("canvas_thread_ts")
        or message_ts
    )
    room_id = room.get("id")

    if _huddle_room_ended(room):
        await handle_slack_huddle_ended(team_id, channel_id)
        return None
    return await handle_slack_huddle_started(
        team_id,
        channel_id,
        huddle_thread_ts=thread_ts,
        huddle_room_id=room_id,
    )


async def handle_user_huddle_changed(team_id: str, user: dict[str, Any]) -> None:
    """Fallback when huddle_thread messages are not delivered."""
    profile = user.get("profile") or {}
    huddle_state = profile.get("huddle_state") or ""
    slack_user_id = user.get("id")
    if not slack_user_id:
        return

    integrations = await _users_for_slack_team(team_id)
    for integration in integrations:
        meta = integration.metadata_ or {}
        if meta.get("slackUserId") != slack_user_id:
            continue
        if meta.get("autoHuddleCapture") is False:
            continue

        if huddle_state == "in_a_huddle":
            # Channel is unknown from this event alone; huddle_thread handles start.
            continue

        # User left all huddles — end any active auto-started huddle sessions.
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(CaptureSession).where(
                    CaptureSession.userId == integration.userId,
                    CaptureSession.status == CaptureSessionStatus.ACTIVE,
                    CaptureSession.sourceType == CaptureSourceType.SLACK,
                )
            )
            sessions = result.scalars().all()

        for session in sessions:
            if not (session.metadata_ or {}).get("huddle"):
                continue
            try:
                await end_session(session.id, integration.userId)
            except Exception as error:
                print(f"Failed to end huddle session {session.id}: {error}")
