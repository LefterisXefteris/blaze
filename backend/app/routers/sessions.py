from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.auth import AppSession, require_auth
from app.dependencies import get_session_service
from app.schemas.sessions import AppendSessionBody, CreateSessionBody, LinkContextBody, PatchSessionBody
from app.services.session_service import SessionService

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    status: str | None = None,
    source_type: str | None = None,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.list_sessions(session.user.id, status=status, source_type=source_type)


@router.post("", status_code=201)
async def create_session(
    body: CreateSessionBody,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.create_session(session.user.id, body)


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.get_session_detail(session.user.id, session_id)


@router.patch("/{session_id}")
async def patch_session(
    session_id: str,
    body: PatchSessionBody,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.patch_session(session.user.id, session_id, body)


@router.post("/{session_id}")
async def append_to_session(
    session_id: str,
    body: AppendSessionBody,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.append_to_session(session.user.id, session_id, body)


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.delete_session(session.user.id, session_id)


@router.get("/{session_id}/stream")
async def stream_session(
    session_id: str,
    request: Request,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return StreamingResponse(
        sessions.stream_session(session.user.id, session_id, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/{session_id}/context")
async def get_session_context(
    session_id: str,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.get_session_context(session.user.id, session_id)


@router.post("/{session_id}/context")
async def link_session_context(
    session_id: str,
    body: LinkContextBody,
    session: AppSession = Depends(require_auth),
    sessions: SessionService = Depends(get_session_service),
):
    return await sessions.link_session_context(session.user.id, session_id, body.priorityItemId)
