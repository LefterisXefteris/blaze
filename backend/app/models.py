import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class IntegrationProvider(str, enum.Enum):
    GOOGLE_CALENDAR = "GOOGLE_CALENDAR"
    SLACK = "SLACK"
    GITHUB = "GITHUB"


class CaptureSourceType(str, enum.Enum):
    MANUAL = "MANUAL"
    SLACK = "SLACK"
    MEETING = "MEETING"
    GITHUB = "GITHUB"


class CaptureSessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class IntentType(str, enum.Enum):
    CALENDAR_EVENT = "CALENDAR_EVENT"
    TODO = "TODO"
    FOLLOW_UP_EMAIL = "FOLLOW_UP_EMAIL"
    TICKET = "TICKET"
    CRM_UPDATE = "CRM_UPDATE"
    GITHUB_COMMENT = "GITHUB_COMMENT"
    GITHUB_LABEL = "GITHUB_LABEL"
    GITHUB_PRIORITY = "GITHUB_PRIORITY"
    GITHUB_ACK_COMMENT = "GITHUB_ACK_COMMENT"
    GITHUB_NEXT_STEPS = "GITHUB_NEXT_STEPS"


class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    HIGH = "HIGH"


class AgentActionStatus(str, enum.Enum):
    PENDING = "PENDING"
    AUTO_EXECUTED = "AUTO_EXECUTED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    UNDONE = "UNDONE"
    FAILED = "FAILED"


class ContextSourceType(str, enum.Enum):
    GITHUB = "GITHUB"
    MEETING = "MEETING"
    NOTE = "NOTE"
    PRIORITY = "PRIORITY"


class ContextLinkReason(str, enum.Enum):
    EXPLICIT = "EXPLICIT"
    SEMANTIC = "SEMANTIC"
    ENTITY_MATCH = "ENTITY_MATCH"
    CALENDAR = "CALENDAR"


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    image: Mapped[str | None] = mapped_column(String, nullable=True)
    timezone: Mapped[str] = mapped_column(String, default="UTC")
    undoWindowMin: Mapped[int] = mapped_column(Integer, default=15)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    integrations: Mapped[list["Integration"]] = relationship(back_populates="user")
    captureSessions: Mapped[list["CaptureSession"]] = relationship(back_populates="user")
    recipes: Mapped[list["Recipe"]] = relationship(back_populates="user")
    priorityItems: Mapped[list["PriorityItem"]] = relationship(back_populates="user")


class Integration(Base):
    __tablename__ = "Integration"
    __table_args__ = (UniqueConstraint("userId", "provider"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("User.id", ondelete="CASCADE"))
    provider: Mapped[IntegrationProvider] = mapped_column(Enum(IntegrationProvider, name="IntegrationProvider"))
    accessToken: Mapped[str] = mapped_column(Text)
    refreshToken: Mapped[str | None] = mapped_column(Text, nullable=True)
    expiresAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="integrations")


class CaptureSession(Base):
    __tablename__ = "CaptureSession"
    __table_args__ = (
        Index("CaptureSession_userId_status_idx", "userId", "status"),
        Index("CaptureSession_sourceType_sourceRef_idx", "sourceType", "sourceRef"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("User.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    sourceType: Mapped[CaptureSourceType] = mapped_column(
        Enum(CaptureSourceType, name="CaptureSourceType"), default=CaptureSourceType.MANUAL
    )
    sourceRef: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[CaptureSessionStatus] = mapped_column(
        Enum(CaptureSessionStatus, name="CaptureSessionStatus"), default=CaptureSessionStatus.ACTIVE
    )
    userNotes: Mapped[str] = mapped_column(Text, default="")
    liveSummary: Mapped[str] = mapped_column(Text, default="")
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    startedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    endedAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="captureSessions")
    messages: Mapped[list["Message"]] = relationship(back_populates="session", order_by="Message.sentAt")
    note: Mapped["Note | None"] = relationship(back_populates="session", uselist=False)
    agentActions: Mapped[list["AgentAction"]] = relationship(back_populates="session")
    priorityItems: Mapped[list["PriorityItem"]] = relationship(back_populates="session")


class Message(Base):
    __tablename__ = "Message"
    __table_args__ = (
        UniqueConstraint("sessionId", "externalId"),
        Index("Message_sessionId_sentAt_idx", "sessionId", "sentAt"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sessionId: Mapped[str] = mapped_column(String, ForeignKey("CaptureSession.id", ondelete="CASCADE"))
    externalId: Mapped[str | None] = mapped_column(String, nullable=True)
    speaker: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    sentAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["CaptureSession"] = relationship(back_populates="messages")


class Note(Base):
    __tablename__ = "Note"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sessionId: Mapped[str] = mapped_column(String, ForeignKey("CaptureSession.id", ondelete="CASCADE"), unique=True)
    aiSummary: Mapped[str] = mapped_column(Text)
    structured: Mapped[dict[str, Any]] = mapped_column(JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    session: Mapped["CaptureSession"] = relationship(back_populates="note")


class AgentAction(Base):
    __tablename__ = "AgentAction"
    __table_args__ = (
        Index("AgentAction_sessionId_idx", "sessionId"),
        Index("AgentAction_status_idx", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sessionId: Mapped[str] = mapped_column(String, ForeignKey("CaptureSession.id", ondelete="CASCADE"))
    intentType: Mapped[IntentType] = mapped_column(Enum(IntentType, name="IntentType"))
    riskLevel: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel, name="RiskLevel"))
    status: Mapped[AgentActionStatus] = mapped_column(
        Enum(AgentActionStatus, name="AgentActionStatus"), default=AgentActionStatus.PENDING
    )
    confidence: Mapped[float] = mapped_column(Float, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    sourceMessageIds: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    externalId: Mapped[str | None] = mapped_column(String, nullable=True)
    undoExpiresAt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    session: Mapped["CaptureSession"] = relationship(back_populates="agentActions")
    revisions: Mapped[list["ActionRevision"]] = relationship(back_populates="action")


class ActionRevision(Base):
    __tablename__ = "ActionRevision"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    actionId: Mapped[str] = mapped_column(String, ForeignKey("AgentAction.id", ondelete="CASCADE"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    action: Mapped["AgentAction"] = relationship(back_populates="revisions")


class Recipe(Base):
    __tablename__ = "Recipe"
    __table_args__ = (UniqueConstraint("userId", "name"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("User.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    prompt: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="recipes")


class PriorityItem(Base):
    __tablename__ = "PriorityItem"
    __table_args__ = (
        UniqueConstraint("userId", "source", "externalId"),
        Index("PriorityItem_userId_status_priority_idx", "userId", "status", "priority"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("User.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String, default="github")
    externalId: Mapped[str] = mapped_column(String)
    externalUrl: Mapped[str] = mapped_column(String)
    itemType: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    repo: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(String)
    priority: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String, default="open")
    aiSummary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sessionId: Mapped[str | None] = mapped_column(
        String, ForeignKey("CaptureSession.id", ondelete="SET NULL"), nullable=True
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="priorityItems")
    session: Mapped["CaptureSession | None"] = relationship(back_populates="priorityItems")


class WebhookDelivery(Base):
    __tablename__ = "WebhookDelivery"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String)
    receivedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContextChunk(Base):
    __tablename__ = "ContextChunk"
    __table_args__ = (
        UniqueConstraint("userId", "sourceType", "sourceId", "chunkIndex"),
        Index("ContextChunk_userId_sourceType_idx", "userId", "sourceType"),
        Index("ContextChunk_userId_sourceRef_idx", "userId", "sourceRef"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False))
    sourceType: Mapped[ContextSourceType] = mapped_column(Enum(ContextSourceType, name="ContextSourceType"))
    sourceId: Mapped[str] = mapped_column(String)
    sourceRef: Mapped[str | None] = mapped_column(String, nullable=True)
    chunkIndex: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        insert_default=func.now(),
    )


class ContextLink(Base):
    __tablename__ = "ContextLink"
    __table_args__ = (
        UniqueConstraint("userId", "fromId", "toId"),
        Index("ContextLink_userId_fromId_idx", "userId", "fromId"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(UUID(as_uuid=False))
    fromType: Mapped[str] = mapped_column(String)
    fromId: Mapped[str] = mapped_column(String)
    toType: Mapped[str] = mapped_column(String)
    toId: Mapped[str] = mapped_column(String)
    linkReason: Mapped[ContextLinkReason] = mapped_column(
        Enum(ContextLinkReason, name="ContextLinkReason"), default=ContextLinkReason.SEMANTIC
    )
    confidence: Mapped[float] = mapped_column(Float, default=1)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
