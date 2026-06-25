from pydantic import BaseModel, Field


class CreateSessionBody(BaseModel):
    title: str | None = None
    sourceType: str = "MANUAL"
    sourceRef: str | None = None
    transcript: str | None = None


class PatchSessionBody(BaseModel):
    action: str | None = None
    title: str | None = None
    userNotes: str | None = None


class AppendSessionBody(BaseModel):
    transcript: str | None = None
    speaker: str | None = None
    content: str | None = None
    source: str | None = None


class LinkContextBody(BaseModel):
    priorityItemId: str = Field(min_length=1)
