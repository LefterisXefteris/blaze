from pydantic import BaseModel


class UploadMeetingBody(BaseModel):
    title: str | None = None
    transcript: str | None = None
