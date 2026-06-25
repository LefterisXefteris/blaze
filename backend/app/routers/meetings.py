from fastapi import APIRouter, Depends

from app.auth import AppSession, require_auth
from app.dependencies import get_meeting_service
from app.schemas.meetings import UploadMeetingBody
from app.services.meeting_service import MeetingService

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.post("/upload", status_code=201)
async def upload_meeting(
    body: UploadMeetingBody,
    session: AppSession = Depends(require_auth),
    meetings: MeetingService = Depends(get_meeting_service),
):
    return await meetings.upload_meeting(session.user.id, body)
