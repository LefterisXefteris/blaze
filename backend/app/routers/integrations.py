from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.auth import AppSession, require_auth
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import AgentAction, IntentType, PriorityItem
from app.services.agent.github_processor import import_github_url, sync_github_mentions
from app.services.integrations.github_webhook import handle_github_webhook, verify_github_signature
from app.services.integrations.plugin import IntegrationRegistry
from app.services.integrations import plugins  # noqa: F401 — register plugins
from app.utils import app_origin, serialize_model

router = APIRouter(tags=["integrations"])


@router.get("/api/integrations/status")
async def integration_status(session: AppSession = Depends(require_auth)):
    settings = get_settings()
    response: dict[str, Any] = {
        "appUrl": settings.app_url,
        "elevenlabsConfigured": bool(settings.elevenlabs_api_key),
        "plugins": {},
    }

    for plugin in IntegrationRegistry.all():
        status = await plugin.get_status(session.user.id, settings)
        response["plugins"][plugin.slug] = {
            "connected": status.connected,
            "configured": status.configured,
            "metadata": status.metadata,
        }
        response.update(plugin.to_status_response(status))

    return response


@router.get("/api/integrations/{slug}")
async def integration_oauth_start(slug: str, session: AppSession = Depends(require_auth)):
    plugin = IntegrationRegistry.get(slug)
    settings = get_settings()
    return plugin.oauth_start(session.user.id, settings, app_origin())


@router.get("/api/integrations/{slug}/callback")
async def integration_oauth_callback(
    slug: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    plugin = IntegrationRegistry.get(slug)
    settings = get_settings()
    return await plugin.oauth_callback(code, state, error, settings, app_origin())


@router.patch("/api/integrations/{slug}/settings")
async def patch_integration_settings(
    slug: str,
    body: dict[str, Any],
    session: AppSession = Depends(require_auth),
):
    plugin = IntegrationRegistry.get(slug)
    try:
        await plugin.patch_settings(session.user.id, body)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


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
