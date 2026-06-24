from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import AgentAction, IntentType, PriorityItem
from app.services.agent.github_processor import import_github_url, sync_github_mentions
from app.services.integrations.github import (
    fetch_github_user,
    save_github_integration,
)
from app.services.integrations.github_webhook import handle_github_webhook, verify_github_signature
from app.services.integrations.slack import (
    save_slack_integration,
    update_slack_settings,
)
from app.services.integrations.google_calendar import (
    is_google_connected,
    save_google_integration,
)
from app.services.integrations.github import (
    get_github_metadata,
    is_github_connected,
)
from app.services.integrations.slack import get_slack_metadata, is_slack_connected
from app.utils import app_origin, serialize_model

router = APIRouter(tags=["integrations"])

GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]


@router.get("/api/integrations/status")
async def integration_status(session: AppSession = Depends(require_auth)):
    settings = get_settings()
    google = await is_google_connected(session.user.id)
    slack = await is_slack_connected(session.user.id)
    github_connected = await is_github_connected(session.user.id)
    slack_meta = await get_slack_metadata(session.user.id) if slack else None
    github_meta = await get_github_metadata(session.user.id) if github_connected else None

    return {
        "google": google,
        "googleConfigured": bool(
            settings.google_client_id and settings.google_client_secret
        ),
        "slack": slack,
        "slackConfigured": bool(settings.slack_client_id and settings.slack_client_secret),
        "appUrl": settings.app_url,
        "slackSettings": slack_meta,
        "github": github_connected,
        "githubConfigured": bool(
            settings.github_client_id and settings.github_client_secret
        ),
        "githubLogin": github_meta.get("githubLogin") if github_meta else None,
        "githubSettings": github_meta,
        "elevenlabsConfigured": bool(settings.elevenlabs_api_key),
    }


@router.get("/api/integrations/google")
async def google_oauth_start(session: AppSession = Depends(require_auth)):
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        return RedirectResponse(f"{app_origin()}/settings?google=not_configured")

    redirect_uri = f"{app_origin()}/api/integrations/google/callback"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_CALENDAR_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": session.user.id,
    }
    return RedirectResponse(
        f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    )


@router.get("/api/integrations/google/callback")
async def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    origin = app_origin()
    settings = get_settings()

    if error or not code or not state:
        return RedirectResponse(f"{origin}/settings?google=error")

    redirect_uri = f"{origin}/api/integrations/google/callback"
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        token_data = token_res.json()

    if token_data.get("error") or not token_data.get("access_token"):
        return RedirectResponse(f"{origin}/settings?google=error")

    expires_at = None
    if token_data.get("expires_in"):
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=int(token_data["expires_in"])
        )

    await save_google_integration(
        state,
        token_data["access_token"],
        token_data.get("refresh_token"),
        expires_at,
    )
    return RedirectResponse(f"{origin}/settings?google=connected")


@router.get("/api/integrations/github")
async def github_oauth_start(session: AppSession = Depends(require_auth)):
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        return RedirectResponse(f"{app_origin()}/settings?github=not_configured")

    redirect_uri = f"{app_origin()}/api/integrations/github/callback"
    url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=read:user repo"
        f"&state={session.user.id}"
    )
    return RedirectResponse(url)


@router.get("/api/integrations/github/callback")
async def github_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    origin = app_origin()
    settings = get_settings()

    if error or not code or not state:
        return RedirectResponse(f"{origin}/settings?github=error")

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": f"{origin}/api/integrations/github/callback",
            },
        )
        token_data = token_res.json()

    if token_data.get("error") or not token_data.get("access_token"):
        return RedirectResponse(f"{origin}/settings?github=error")

    gh_user = await fetch_github_user(token_data["access_token"])
    await save_github_integration(
        state,
        token_data["access_token"],
        {
            "githubLogin": gh_user["login"],
            "autoAssign": True,
            "autoMention": True,
            "autoReview": True,
            "autoAckMention": True,
        },
    )
    return RedirectResponse(f"{origin}/settings?github=connected")


@router.get("/api/integrations/slack")
async def slack_oauth_start(session: AppSession = Depends(require_auth)):
    settings = get_settings()
    if not settings.slack_client_id or not settings.slack_client_secret:
        return RedirectResponse(f"{app_origin()}/settings?slack=not_configured")

    scopes = ",".join(
        [
            "channels:history",
            "channels:read",
            "channels:join",
            "groups:history",
            "groups:read",
            "im:history",
            "im:read",
            "users:read",
            "chat:write",
            "canvases:write",
        ]
    )
    redirect_uri = f"{app_origin()}/api/integrations/slack/callback"
    url = (
        f"https://slack.com/oauth/v2/authorize"
        f"?client_id={settings.slack_client_id}"
        f"&scope={scopes}"
        f"&redirect_uri={redirect_uri}"
        f"&state={session.user.id}"
    )
    return RedirectResponse(url)


@router.get("/api/integrations/slack/callback")
async def slack_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    origin = app_origin()
    settings = get_settings()

    if error or not code or not state:
        return RedirectResponse(f"{origin}/settings?slack=error")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "client_id": settings.slack_client_id,
                "client_secret": settings.slack_client_secret,
                "code": code,
                "redirect_uri": f"{origin}/api/integrations/slack/callback",
            },
        )
        data = response.json()

    if not data.get("ok"):
        return RedirectResponse(f"{origin}/settings?slack=error")

    await save_slack_integration(
        state,
        data["access_token"],
        {
            "teamId": data.get("team", {}).get("id"),
            "teamName": data.get("team", {}).get("name"),
            "slackUserId": data.get("authed_user", {}).get("id"),
            "autoHuddleCapture": True,
            "slackApprovals": True,
            "slackLiveNotes": True,
        },
    )
    return RedirectResponse(f"{origin}/settings?slack=connected")


@router.patch("/api/integrations/slack/settings")
async def patch_slack_settings(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    try:
        await update_slack_settings(session.user.id, body)
        return {"success": True}
    except Exception:
        raise HTTPException(400, "Slack not connected")


github_router = APIRouter(prefix="/api/github", tags=["github"])


@github_router.get("/inbox")
async def github_inbox(
    reason: str | None = None,
    status: str = "open",
    session: AppSession = Depends(require_auth),
):
    async with AsyncSessionLocal() as db:
        from app.models import CaptureSession

        stmt = (
            select(PriorityItem)
            .options(
                selectinload(PriorityItem.session).selectinload(CaptureSession.agentActions)
            )
            .where(
                PriorityItem.userId == session.user.id,
                PriorityItem.source == "github",
                PriorityItem.status == status,
            )
            .order_by(PriorityItem.priority.asc(), PriorityItem.createdAt.desc())
            .limit(100)
        )
        if reason:
            stmt = stmt.where(PriorityItem.reason == reason)

        result = await db.execute(stmt)
        items = result.scalars().all()
        output = []
        for item in items:
            data = serialize_model(item)
            if item.session:
                actions = [
                    serialize_model(a)
                    for a in item.session.agentActions
                    if a.intentType
                    in (IntentType.GITHUB_ACK_COMMENT, IntentType.GITHUB_NEXT_STEPS)
                ]
                data["session"] = {
                    "id": item.session.id,
                    "title": item.session.title,
                    "agentActions": sorted(actions, key=lambda x: x.get("createdAt", "")),
                }
            else:
                data["session"] = None
            output.append(data)
        return output


@github_router.post("/sync")
async def github_sync(session: AppSession = Depends(require_auth)):
    try:
        result = await sync_github_mentions(session.user.id)
        return result
    except Exception as error:
        raise HTTPException(500, str(error))


@github_router.post("/import", status_code=201)
async def github_import(body: dict[str, Any], session: AppSession = Depends(require_auth)):
    url = body.get("url")
    if not url:
        raise HTTPException(400, "url required")
    try:
        result = await import_github_url(session.user.id, url)
        return result
    except Exception as error:
        raise HTTPException(400, str(error))


@github_router.post("/webhook")
async def github_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    delivery_id = request.headers.get("x-github-delivery")
    event = request.headers.get("x-github-event")

    settings = get_settings()
    if settings.github_webhook_secret and not verify_github_signature(
        payload.decode(), signature, settings.github_webhook_secret
    ):
        raise HTTPException(401, "Invalid signature")

    if not delivery_id or not event:
        raise HTTPException(400, "Missing headers")

    try:
        import json

        await handle_github_webhook(delivery_id, event, json.loads(payload))
    except Exception as error:
        print(f"GitHub webhook error: {error}")

    return {"ok": True}

router.include_router(github_router)
