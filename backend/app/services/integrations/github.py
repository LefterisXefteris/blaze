import secrets
from typing import Any

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Integration, IntegrationProvider


GITHUB_API = "https://api.github.com"


def new_id() -> str:
    return secrets.token_hex(12)


async def get_github_token(user_id: str) -> str | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GITHUB,
            )
        )
        integration = result.scalar_one_or_none()
    return integration.accessToken if integration else None


async def get_github_metadata(user_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GITHUB,
            )
        )
        integration = result.scalar_one_or_none()
    if not integration or not integration.metadata_:
        return {}
    return integration.metadata_


async def is_github_connected(user_id: str) -> bool:
    token = await get_github_token(user_id)
    return bool(token)


async def save_github_integration(
    user_id: str,
    access_token: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    meta = {
        "autoAssign": True,
        "autoMention": True,
        "autoReview": True,
        "autoAckMention": True,
        **(metadata or {}),
    }

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GITHUB,
            )
        )
        integration = result.scalar_one_or_none()

        if integration:
            integration.accessToken = access_token
            integration.metadata_ = meta
        else:
            db.add(
                Integration(
                    id=new_id(),
                    userId=user_id,
                    provider=IntegrationProvider.GITHUB,
                    accessToken=access_token,
                    metadata_=meta,
                )
            )
        await db.commit()


async def update_github_settings(
    user_id: str,
    settings: dict[str, Any],
) -> None:
    existing = await get_github_metadata(user_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(
                Integration.userId == user_id,
                Integration.provider == IntegrationProvider.GITHUB,
            )
        )
        integration = result.scalar_one_or_none()
        if integration:
            integration.metadata_ = {**existing, **settings}
            await db.commit()


async def github_fetch(
    token: str,
    path: str,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
) -> Any:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient() as client:
        response = await client.request(
            method,
            f"{GITHUB_API}{path}",
            headers=headers,
            json=json_body,
        )
        if not response.is_success:
            raise RuntimeError(f"GitHub API error: {response.status_code} {response.text}")
        return response.json()


async def fetch_github_user(token: str) -> dict[str, Any]:
    return await github_fetch(token, "/user")


async def fetch_issue_or_pull(token: str, repo: str, number: int) -> dict[str, Any]:
    return await github_fetch(token, f"/repos/{repo}/issues/{number}")


async def fetch_issue_comments(token: str, repo: str, number: int) -> list[dict[str, Any]]:
    return await github_fetch(token, f"/repos/{repo}/issues/{number}/comments")


async def post_issue_comment(
    user_id: str,
    repo: str,
    issue_number: int,
    body: str,
) -> dict[str, Any]:
    token = await get_github_token(user_id)
    if not token:
        raise RuntimeError("GitHub not connected")
    return await github_fetch(
        token,
        f"/repos/{repo}/issues/{issue_number}/comments",
        method="POST",
        json_body={"body": body},
    )


async def add_issue_labels(
    user_id: str,
    repo: str,
    issue_number: int,
    labels: list[str],
) -> Any:
    token = await get_github_token(user_id)
    if not token:
        raise RuntimeError("GitHub not connected")
    return await github_fetch(
        token,
        f"/repos/{repo}/issues/{issue_number}/labels",
        method="POST",
        json_body={"labels": labels},
    )


async def find_user_by_github_login(login: str) -> str | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Integration).where(Integration.provider == IntegrationProvider.GITHUB)
        )
        integrations = result.scalars().all()

    login_lower = login.lower()
    for integration in integrations:
        meta = integration.metadata_ or {}
        github_login = meta.get("githubLogin")
        if github_login and github_login.lower() == login_lower:
            return integration.userId
    return None


def external_id_for_issue(repo: str, number: int) -> str:
    return f"{repo}#{number}"
