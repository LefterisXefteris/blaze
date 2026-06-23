from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from app.auth import AppUser, ensure_db_user
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSourceType, Message
from app.queue import enqueue_intent_extraction
from app.utils import app_origin
import httpx
import secrets

router = APIRouter(prefix="/api/dev", tags=["dev"])

DEMO_EMAIL = "demo@blaze.local"
DEMO_PASSWORD = "blaze-demo-password"


def new_id() -> str:
    return secrets.token_hex(12)


def _set_supabase_cookies(response: RedirectResponse, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    ref = settings.supabase_url.split("//")[1].split(".")[0]
    cookie_name = f"sb-{ref}-auth-token"
    import json
    import base64

    session_data = json.dumps([access_token, refresh_token, None, None, None])
    encoded = "base64-" + base64.b64encode(session_data.encode()).decode()
    response.set_cookie(
        key=cookie_name,
        value=encoded,
        httponly=True,
        samesite="lax",
        path="/",
    )


@router.get("/demo-login")
async def demo_login():
    settings = get_settings()
    if not settings.dev_demo_login:
        raise HTTPException(403, "Demo login disabled")

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            503,
            "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for demo login",
        )

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        users_res = await client.get(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers=headers,
        )
        users_data = users_res.json()
        demo_user = next(
            (u for u in users_data.get("users", []) if u.get("email") == DEMO_EMAIL),
            None,
        )

        if not demo_user:
            create_res = await client.post(
                f"{settings.supabase_url}/auth/v1/admin/users",
                headers=headers,
                json={
                    "email": DEMO_EMAIL,
                    "password": DEMO_PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {"full_name": "Demo User"},
                },
            )
            if create_res.status_code >= 400:
                raise HTTPException(500, create_res.text)
            demo_user = create_res.json()

        sign_in_res = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            headers={"apikey": settings.supabase_anon_key, "Content-Type": "application/json"},
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        )
        if sign_in_res.status_code >= 400:
            raise HTTPException(500, sign_in_res.text)

        session_data = sign_in_res.json()
        access_token = session_data["access_token"]
        refresh_token = session_data["refresh_token"]
        user_id = session_data["user"]["id"]

    async with AsyncSessionLocal() as db:
        await ensure_db_user(
            db,
            AppUser(
                id=user_id,
                name="Demo User",
                email=DEMO_EMAIL,
                image=None,
            ),
        )

        count = await db.scalar(
            select(func.count()).select_from(CaptureSession).where(CaptureSession.userId == user_id)
        )
        if not count:
            capture = CaptureSession(
                id=new_id(),
                userId=user_id,
                title="Product sync with Alex",
                sourceType=CaptureSourceType.MANUAL,
            )
            db.add(capture)
            await db.flush()

            messages = [
                {"speaker": "Alex", "content": "Let's sync Tuesday at 3pm to review the roadmap."},
                {"speaker": "You", "content": "Sounds good. I'll send the deck by Friday."},
                {
                    "speaker": "Alex",
                    "content": "Can you draft a recap email to the client after we meet?",
                },
            ]
            for msg in messages:
                db.add(
                    Message(
                        id=new_id(),
                        sessionId=capture.id,
                        speaker=msg["speaker"],
                        content=msg["content"],
                    )
                )
            await db.commit()
            await enqueue_intent_extraction(capture.id)

    response = RedirectResponse(f"{app_origin()}/dashboard")
    _set_supabase_cookies(response, access_token, refresh_token)
    return response
