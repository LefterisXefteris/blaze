import base64
import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User


@dataclass
class AppUser:
    id: str
    name: str | None
    email: str | None
    image: str | None


@dataclass
class AppSession:
    user: AppUser


def _decode_base64url(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _parse_supabase_session(raw: str) -> dict[str, Any] | list[Any] | None:
    try:
        if raw.startswith("base64-"):
            decoded = _decode_base64url(raw[7:]).decode("utf-8")
            return json.loads(decoded)
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        return None


def _extract_access_token(request: Request) -> str | None:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()

    cookie_map: dict[str, str] = dict(request.cookies)
    auth_cookies: list[tuple[int, str]] = []

    for name, value in cookie_map.items():
        if "-auth-token" not in name:
            continue
        chunk_match = re.search(r"\.(\d+)$", name)
        idx = int(chunk_match.group(1)) if chunk_match else 0
        auth_cookies.append((idx, value))

    if not auth_cookies:
        return None

    auth_cookies.sort(key=lambda item: item[0])
    combined = "".join(value for _, value in auth_cookies)

    session = _parse_supabase_session(combined)
    if not session:
        return None

    if isinstance(session, list) and session:
        return session[0] if isinstance(session[0], str) else None
    if isinstance(session, dict):
        token = session.get("access_token")
        return token if isinstance(token, str) else None
    return None


async def _verify_token(token: str) -> dict[str, Any]:
    settings = get_settings()

    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError:
            pass

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return response.json()


def _profile_from_claims(claims: dict[str, Any]) -> AppUser:
    meta = claims.get("user_metadata") or {}
    return AppUser(
        id=claims.get("sub") or claims.get("id", ""),
        email=claims.get("email"),
        name=meta.get("full_name") or meta.get("name"),
        image=meta.get("avatar_url"),
    )


async def ensure_db_user(db: AsyncSession, user: AppUser) -> User:
    result = await db.execute(select(User).where(User.id == user.id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.email = user.email
        existing.name = user.name
        existing.image = user.image
        await db.commit()
        await db.refresh(existing)
        return existing

    db_user = User(
        id=user.id,
        email=user.email,
        name=user.name,
        image=user.image,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def get_current_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AppSession:
    token = _extract_access_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    claims = await _verify_token(token)
    profile = _profile_from_claims(claims)
    db_user = await ensure_db_user(db, profile)

    return AppSession(
        user=AppUser(
            id=db_user.id,
            name=db_user.name,
            email=db_user.email,
            image=db_user.image,
        )
    )


async def require_auth(session: AppSession = Depends(get_current_session)) -> AppSession:
    if not session.user.id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return session
