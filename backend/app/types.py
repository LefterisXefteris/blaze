"""Shared domain types and helpers."""

import re
from typing import Any, Literal

DEFAULT_RISK_BY_INTENT: dict[str, Literal["low", "high"]] = {
    "calendar_event": "low",
    "todo": "low",
    "follow_up_email": "high",
    "ticket": "high",
    "crm_update": "high",
    "github_priority": "low",
    "github_comment": "high",
    "github_label": "high",
    "github_ack_comment": "low",
    "github_next_steps": "high",
}

INTENT_TYPE_TO_ENUM = {
    "calendar_event": "CALENDAR_EVENT",
    "todo": "TODO",
    "follow_up_email": "FOLLOW_UP_EMAIL",
    "ticket": "TICKET",
    "crm_update": "CRM_UPDATE",
    "github_priority": "GITHUB_PRIORITY",
    "github_comment": "GITHUB_COMMENT",
    "github_label": "GITHUB_LABEL",
    "github_ack_comment": "GITHUB_ACK_COMMENT",
    "github_next_steps": "GITHUB_NEXT_STEPS",
}

ENUM_TO_INTENT_TYPE = {v: k for k, v in INTENT_TYPE_TO_ENUM.items()}


def intent_type_to_enum(intent_type: str) -> str:
    return INTENT_TYPE_TO_ENUM[intent_type]


def enum_to_intent_type(enum_type: str) -> str | None:
    return ENUM_TO_INTENT_TYPE.get(enum_type)


def parse_github_url(url: str) -> dict[str, Any] | None:
    match = re.match(r"github\.com/([^/]+/[^/]+)/(issues|pull)/(\d+)", url)
    if not match:
        return None
    repo, kind, num = match.groups()
    return {
        "repo": repo,
        "number": int(num),
        "itemType": "pull_request" if kind == "pull" else "issue",
        "url": f"https://github.com/{repo}/{kind}/{num}",
        "title": "",
    }


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
SIMILARITY_THRESHOLD = 0.72


from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Intent(BaseModel):
    type: Literal[
        "calendar_event",
        "todo",
        "follow_up_email",
        "ticket",
        "crm_update",
        "github_priority",
        "github_comment",
        "github_label",
        "github_ack_comment",
        "github_next_steps",
    ]
    confidence: float = Field(ge=0, le=1)
    title: str
    description: str | None = None
    start: str | None = None
    end: str | None = None
    dueDate: str | None = None
    attendees: list[str] | None = None
    assignee: str | None = None
    sourceMessageIds: list[str] = Field(default_factory=list)
    risk: Literal["low", "high"]
    repo: str | None = None
    issueNumber: int | None = None
    labels: list[str] | None = None
    body: str | None = None
    summary: str | None = None
    steps: list[str] | None = None
    suggestedAction: Literal[
        "follow_up_comment", "mark_done", "watch", "handoff_coding"
    ] | None = None
    draftFollowUp: str | None = None


class ExtractionResult(BaseModel):
    intents: list[Intent] = Field(default_factory=list)


class SessionMessage(BaseModel):
    id: str
    speaker: str
    content: str
    sentAt: datetime


class ContextHit(BaseModel):
    id: str
    sourceType: Literal["GITHUB", "MEETING", "NOTE", "PRIORITY"]
    sourceId: str
    sourceRef: str | None
    purpose: str | None
    content: str
    similarity: float
    linkReason: Literal["semantic", "entity_match", "explicit"]
    metadata: dict[str, Any] | None = None


class IndexChunkInput(BaseModel):
    userId: str
    sourceType: Literal["GITHUB", "MEETING", "NOTE", "PRIORITY"]
    sourceId: str
    sourceRef: str | None = None
    chunkIndex: int
    content: str
    purpose: str | None = None
    metadata: dict[str, Any] | None = None


class SessionRelatedContext(BaseModel):
    hits: list[ContextHit]
    promptText: str
    updatedAt: str


class GitHubIntegrationMetadata(BaseModel):
    githubLogin: str | None = None
    autoAssign: bool | None = None
    autoMention: bool | None = None
    autoReview: bool | None = None
    autoAckMention: bool | None = None


class GitHubMentionPlan(BaseModel):
    ackComment: str
    nextSteps: Intent
