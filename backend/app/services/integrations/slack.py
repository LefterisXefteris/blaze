import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Any

from slack_sdk import WebClient
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
from app.queue import enqueue_intent_extraction, schedule_live_notes_update


async def get_slack_client(user_id: str) -> WebClient | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()
    if not integration:
        return None
    return WebClient(token=integration.accessToken)


async def is_slack_connected(user_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        return result.scalar_one_or_none() is not None


async def get_slack_metadata(user_id: str) -> dict[str, Any] | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()
    return integration.metadata_ if integration else None


async def update_slack_settings(
    user_id: str,
    settings: dict[str, Any],
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()
        if not integration:
            raise RuntimeError("Slack not connected")

        metadata = dict(integration.metadata_ or {})
        metadata.update(settings)
        integration.metadata_ = metadata
        await db.commit()


async def save_slack_integration(
    user_id: str,
    access_token: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    meta = metadata or {}
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
        integration = result.scalar_one_or_none()

        if integration:
            integration.accessToken = access_token
            integration.metadata_ = meta
        else:
            db.add(
                Integration(
                    id=generate_id(),
                    userId=user_id,
                    provider=IntegrationProvider.SLACK,
                    accessToken=access_token,
                    metadata_=meta,
                )
            )
        await db.commit()


async def list_slack_channels(user_id: str) -> list[dict[str, str]]:
    client = await get_slack_client(user_id)
    if not client:
        return []

    channels_result = client.conversations_list(
        types="public_channel,private_channel", limit=50
    )
    ims_result = client.conversations_list(types="im", limit=50)

    items: list[dict[str, str]] = []
    for c in channels_result.get("channels") or []:
        items.append(
            {
                "id": c["id"],
                "name": c.get("name") or c["id"],
                "type": "channel",
            }
        )
    for c in ims_result.get("channels") or []:
        items.append(
            {
                "id": c["id"],
                "name": f"DM:{c.get('user')}" if c.get("user") else c["id"],
                "type": "im",
            }
        )
    return items


async def fetch_channel_history(
    user_id: str,
    channel_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    client = await get_slack_client(user_id)
    if not client:
        return []

    result = client.conversations_history(channel=channel_id, limit=limit)
    messages = result.get("messages") or []

    user_ids = list({m.get("user") for m in messages if m.get("user")})
    users: dict[str, str] = {}

    for uid in user_ids:
        try:
            info = client.users_info(user=uid)
            user_data = info.get("user") or {}
            users[uid] = user_data.get("real_name") or user_data.get("name") or uid
        except Exception:
            users[uid] = uid

    return [
        {
            "externalId": m["ts"],
            "speaker": users.get(m.get("user"), m.get("user") or "Unknown"),
            "content": m["text"],
            "sentAt": datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc),
        }
        for m in reversed(messages)
        if m.get("text") and not m.get("subtype")
    ]


async def handle_slack_message(
    channel_id: str,
    message: dict[str, Any],
) -> None:
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
                CaptureSession.sourceType == CaptureSourceType.SLACK,
                CaptureSession.sourceRef == channel_id,
            )
        )
        active_sessions = session_result.scalars().all()

    if not active_sessions or not message.get("text"):
        return

    for session in active_sessions:
        async with AsyncSessionLocal() as db:
            existing_result = await db.execute(
                select(Message).where(
                    Message.sessionId == session.id,
                    Message.externalId == message["ts"],
                )
            )
            if existing_result.scalar_one_or_none():
                continue

            speaker = "Unknown"
            integration_result = await db.execute(
                select(Integration).where(
                    Integration.userId == session.userId,
                    Integration.provider == IntegrationProvider.SLACK,
                )
            )
            integration = integration_result.scalar_one_or_none()

            if integration and message.get("user"):
                client = WebClient(token=integration.accessToken)
                try:
                    info = client.users_info(user=message["user"])
                    user_data = info.get("user") or {}
                    speaker = (
                        user_data.get("real_name")
                        or user_data.get("name")
                        or message["user"]
                    )
                except Exception:
                    speaker = message["user"]

            db.add(
                Message(
                    id=generate_id(),
                    sessionId=session.id,
                    externalId=message["ts"],
                    speaker=speaker,
                    content=message["text"],
                    sentAt=datetime.fromtimestamp(float(message["ts"]), tz=timezone.utc),
                )
            )
            await db.commit()

        await enqueue_intent_extraction(session.id)
        schedule_live_notes_update(session.id)


def verify_slack_signature(
    signing_secret: str,
    signature: str,
    timestamp: str,
    body: str,
) -> bool:
    five_minutes_ago = int(time.time()) - 60 * 5
    if int(timestamp) < five_minutes_ago:
        return False

    sig_basestring = f"v0:{timestamp}:{body}"
    my_signature = (
        "v0="
        + hmac.new(
            signing_secret.encode(),
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()
    )
    return hmac.compare_digest(my_signature, signature)
