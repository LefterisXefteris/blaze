from datetime import datetime, timedelta, timezone
from typing import Any

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy import select

from app.config import get_settings
from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import Integration, IntegrationProvider


async def save_google_integration(
    user_id: str,
    access_token: str,
    refresh_token: str | None = None,
    expires_at: datetime | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GOOGLE_CALENDAR,
            )
        )
        integration = result.scalar_one_or_none()

        if integration:
            integration.accessToken = access_token
            if refresh_token:
                integration.refreshToken = refresh_token
            if expires_at:
                integration.expiresAt = expires_at
        else:
            db.add(
                Integration(
                    id=generate_id(),
                    userId=user_id,
                    provider=IntegrationProvider.GOOGLE_CALENDAR,
                    accessToken=access_token,
                    refreshToken=refresh_token,
                    expiresAt=expires_at,
                )
            )
        await db.commit()


async def _get_google_credentials(user_id: str) -> Credentials:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GOOGLE_CALENDAR,
            )
        )
        integration = result.scalar_one_or_none()

    if not integration or not integration.accessToken:
        raise RuntimeError("Google Calendar not connected — sign in with Google")

    settings = get_settings()
    credentials = Credentials(
        token=integration.accessToken,
        refresh_token=integration.refreshToken,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )

    # Refresh token if expired
    if credentials.expired and credentials.refresh_token:
        from google.auth.transport.requests import Request

        credentials.refresh(Request())
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Integration).where(
                    Integration.userId == user_id,
                    Integration.provider == IntegrationProvider.GOOGLE_CALENDAR,
                )
            )
            row = result.scalar_one_or_none()
            if row and credentials.token:
                row.accessToken = credentials.token
                if credentials.refresh_token:
                    row.refreshToken = credentials.refresh_token
                if credentials.expiry:
                    row.expiresAt = credentials.expiry
                await db.commit()

    return credentials


async def create_calendar_event(
    user_id: str,
    event: dict[str, Any],
) -> dict[str, Any]:
    credentials = await _get_google_credentials(user_id)
    calendar = build("calendar", "v3", credentials=credentials)

    now = datetime.now(timezone.utc)
    start = (
        datetime.fromisoformat(event["start"].replace("Z", "+00:00"))
        if event.get("start")
        else now + timedelta(days=1)
    )
    end = (
        datetime.fromisoformat(event["end"].replace("Z", "+00:00"))
        if event.get("end")
        else start + timedelta(hours=1)
    )

    body: dict[str, Any] = {
        "summary": event["title"],
        "description": event.get("description"),
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": end.isoformat()},
        "status": "tentative",
    }
    if event.get("attendees"):
        body["attendees"] = [{"email": email} for email in event["attendees"]]

    response = calendar.events().insert(calendarId="primary", body=body).execute()

    return {
        "id": response.get("id"),
        "htmlLink": response.get("htmlLink"),
        "summary": response.get("summary"),
    }


async def delete_calendar_event(user_id: str, event_id: str) -> None:
    credentials = await _get_google_credentials(user_id)
    calendar = build("calendar", "v3", credentials=credentials)
    calendar.events().delete(calendarId="primary", eventId=event_id).execute()


async def is_google_connected(user_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GOOGLE_CALENDAR,
            )
        )
        integration = result.scalar_one_or_none()
    return bool(integration and integration.accessToken)
