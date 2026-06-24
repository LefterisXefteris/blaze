from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from app.auth import AppSession, ensure_db_user, require_auth
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSourceType, Message
from app.queue import enqueue_intent_extraction
from app.services.agent.live_notes import update_session_live_summary
from app.services.integrations.slack import handle_slack_message, list_slack_channels, verify_slack_signature
from app.services.integrations.slack_approvals import (
    handle_slack_interaction,
    try_handle_approval_command,
)
from app.services.integrations.slack_ping import try_handle_blaze_ping
from app.services.integrations.slack_meetings import (
    handle_slack_huddle_ended,
    handle_slack_huddle_started,
    handle_slack_huddle_thread,
    handle_user_huddle_changed,
    start_slack_meeting_session,
)
from app.utils import app_origin, serialize_model
import secrets

router = APIRouter(prefix="/api/slack", tags=["slack"])


def new_id() -> str:
    return secrets.token_hex(12)


@router.get("/channels")
async def get_channels(session: AppSession = Depends(require_auth)):
    channels = await list_slack_channels(session.user.id)
    return channels


@router.post("/channels", status_code=201)
async def start_channel_session(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    channel_id = body.get("channelId")
    if not channel_id:
        raise HTTPException(400, "channelId required")

    capture = await start_slack_meeting_session(
        session.user.id,
        channel_id,
        title=body.get("title"),
        huddle=False,
        auto_started=False,
    )
    await enqueue_intent_extraction(capture.id)
    await update_session_live_summary(capture.id)
    return serialize_model(capture)


@router.post("/events")
async def slack_events(request: Request):
    body = await request.body()
    payload = __import__("json").loads(body)
    settings = get_settings()

    if payload.get("type") == "url_verification":
        return {"challenge": payload.get("challenge")}

    if settings.slack_signing_secret:
        signature = request.headers.get("x-slack-signature", "")
        timestamp = request.headers.get("x-slack-request-timestamp", "")
        if not verify_slack_signature(settings.slack_signing_secret, signature, timestamp, body.decode()):
            raise HTTPException(401, "Invalid signature")

    event = payload.get("event") or {}
    team_id = payload.get("team_id")

    if event.get("type") == "message" and event.get("channel"):
        subtype = event.get("subtype")

        if subtype == "huddle_thread" and team_id:
            room = event.get("room") or {}
            await handle_slack_huddle_thread(
                team_id,
                event["channel"],
                room,
                message_ts=event.get("ts"),
            )
        elif not subtype:
            if event.get("user") and event.get("text"):
                handled = await try_handle_approval_command(
                    event["channel"],
                    event["user"],
                    event["text"],
                    team_id,
                )
                if not handled:
                    await try_handle_blaze_ping(
                        event["channel"],
                        event.get("user"),
                        event["text"],
                        team_id,
                        thread_ts=event.get("thread_ts") or event.get("ts"),
                        bot_id=event.get("bot_id"),
                    )
                if not handled:
                    await handle_slack_message(
                        event["channel"],
                        {
                            "ts": event.get("ts"),
                            "user": event.get("user"),
                            "text": event.get("text"),
                        },
                    )
            else:
                await handle_slack_message(
                    event["channel"],
                    {
                        "ts": event.get("ts"),
                        "user": event.get("user"),
                        "text": event.get("text"),
                    },
                )

    if team_id and event.get("type") == "user_huddle_changed":
        await handle_user_huddle_changed(team_id, event.get("user") or {})

    # Legacy event names (older Slack apps); kept for compatibility.
    if team_id and event.get("type") == "huddle_started" and event.get("channel_id"):
        await handle_slack_huddle_started(team_id, event["channel_id"])

    if team_id and event.get("type") == "huddle_ended" and event.get("channel_id"):
        await handle_slack_huddle_ended(team_id, event["channel_id"])

    return {"ok": True}


@router.post("/interactions")
async def slack_interactions(request: Request):
    body = await request.body()
    settings = get_settings()

    if settings.slack_signing_secret:
        signature = request.headers.get("x-slack-signature", "")
        timestamp = request.headers.get("x-slack-request-timestamp", "")
        if not verify_slack_signature(
            settings.slack_signing_secret, signature, timestamp, body.decode()
        ):
            raise HTTPException(401, "Invalid signature")

    form = __import__("urllib.parse").parse_qs(body.decode())
    payload_raw = (form.get("payload") or [None])[0]
    if not payload_raw:
        raise HTTPException(400, "Missing payload")

    payload = __import__("json").loads(payload_raw)
    response = await handle_slack_interaction(payload)
    if response:
        return JSONResponse(response)
    return {"ok": True}
