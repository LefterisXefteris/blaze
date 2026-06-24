"""Local-only settings (repo workspace paths on this machine)."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import AppSession, require_auth
from app.services.integrations.repo_workspaces import (
    load_repo_workspaces,
    save_repo_workspaces,
)

router = APIRouter(prefix="/api/local", tags=["local"])


class RepoWorkspacesBody(BaseModel):
    mappings: dict[str, str]


@router.get("/repo-workspaces")
async def get_repo_workspaces(_session: AppSession = Depends(require_auth)) -> dict[str, Any]:
    return {"mappings": load_repo_workspaces()}


@router.put("/repo-workspaces")
async def put_repo_workspaces(
    body: RepoWorkspacesBody,
    _session: AppSession = Depends(require_auth),
) -> dict[str, Any]:
    saved = save_repo_workspaces(body.mappings)
    return {"mappings": saved}
