import secrets
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    CaptureSession,
    ContextLink,
    ContextLinkReason,
    PriorityItem,
)
from app.services.vector.entities import detect_entity_matches, find_priority_by_title_keywords
from app.services.vector.search import format_context_for_prompt, search_context
from app.types import ContextHit, SessionRelatedContext


def new_id() -> str:
    return secrets.token_hex(12)


def _dedupe_hits(hits: list[ContextHit]) -> list[ContextHit]:
    seen: set[str] = set()
    result: list[ContextHit] = []
    for hit in hits:
        key = f"{hit.sourceType}:{hit.sourceId}"
        if key in seen:
            continue
        seen.add(key)
        result.append(hit)
    return result


async def retrieve_meeting_context(
    user_id: str,
    session_id: str,
    user_notes: str,
    messages: list[dict[str, str]],
    title: str | None = None,
) -> SessionRelatedContext:
    transcript_window = " ".join(m["content"] for m in messages[-10:])
    query = "\n".join(p for p in [title or "", user_notes, transcript_window] if p)

    semantic_hits = await search_context(user_id=user_id, query=query, top_k=5)
    entity_from_text = await detect_entity_matches(user_id, query)
    title_hits = await find_priority_by_title_keywords(user_id, title)

    explicit_hits: list[ContextHit] = []
    async with AsyncSessionLocal() as db:
        link_result = await db.execute(
            select(ContextLink).where(
                ContextLink.userId == user_id,
                ContextLink.fromId == session_id,
            )
        )
        explicit_links = link_result.scalars().all()

        for link in explicit_links:
            if link.toType != "PRIORITY":
                continue
            item_result = await db.execute(
                select(PriorityItem).where(
                    PriorityItem.id == link.toId,
                    PriorityItem.userId == user_id,
                )
            )
            item = item_result.scalar_one_or_none()
            if item:
                explicit_hits.append(
                    ContextHit(
                        id=item.id,
                        sourceType="PRIORITY",
                        sourceId=item.id,
                        sourceRef=item.externalId,
                        purpose=item.aiSummary or item.title,
                        content=item.aiSummary or item.title,
                        similarity=1.0,
                        linkReason="explicit",
                        metadata={
                            "externalUrl": item.externalUrl,
                            "sessionId": item.sessionId,
                        },
                    )
                )

    github_hits = _dedupe_hits(
        explicit_hits + entity_from_text + title_hits + semantic_hits
    )
    github_hits = [
        h for h in github_hits if h.sourceType in ("GITHUB", "PRIORITY")
    ]
    hits = github_hits[:5]
    prompt_text = format_context_for_prompt(hits)

    return SessionRelatedContext(
        hits=hits,
        promptText=prompt_text,
        updatedAt=datetime.now(timezone.utc).isoformat(),
    )


def _link_reason_from_hit(hit: ContextHit) -> ContextLinkReason:
    if hit.linkReason == "entity_match":
        return ContextLinkReason.ENTITY_MATCH
    if hit.linkReason == "explicit":
        return ContextLinkReason.EXPLICIT
    return ContextLinkReason.SEMANTIC


async def persist_related_context(
    session_id: str,
    context: SessionRelatedContext,
) -> None:
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            return

        metadata = dict(session.metadata_ or {})
        metadata["relatedContext"] = context.model_dump()

        session.metadata_ = metadata

        for hit in context.hits:
            if hit.sourceType != "PRIORITY":
                continue

            link_result = await db.execute(
                select(ContextLink).where(
                    ContextLink.userId == session.userId,
                    ContextLink.fromId == session_id,
                    ContextLink.toId == hit.sourceId,
                )
            )
            existing_link = link_result.scalar_one_or_none()
            link_reason = _link_reason_from_hit(hit)

            if existing_link:
                existing_link.linkReason = link_reason
                existing_link.confidence = hit.similarity
            else:
                db.add(
                    ContextLink(
                        id=new_id(),
                        userId=session.userId,
                        fromType="MEETING",
                        fromId=session_id,
                        toType="PRIORITY",
                        toId=hit.sourceId,
                        linkReason=link_reason,
                        confidence=hit.similarity,
                    )
                )

        await db.commit()


async def link_priority_to_session(
    user_id: str,
    session_id: str,
    priority_item_id: str,
) -> None:
    async with AsyncSessionLocal() as db:
        link_result = await db.execute(
            select(ContextLink).where(
                ContextLink.userId == user_id,
                ContextLink.fromId == session_id,
                ContextLink.toId == priority_item_id,
            )
        )
        existing = link_result.scalar_one_or_none()

        if existing:
            existing.linkReason = ContextLinkReason.EXPLICIT
            existing.confidence = 1.0
        else:
            db.add(
                ContextLink(
                    id=new_id(),
                    userId=user_id,
                    fromType="MEETING",
                    fromId=session_id,
                    toType="PRIORITY",
                    toId=priority_item_id,
                    linkReason=ContextLinkReason.EXPLICIT,
                    confidence=1.0,
                )
            )
        await db.commit()


def get_stored_related_context(metadata: object) -> SessionRelatedContext | None:
    if not metadata or not isinstance(metadata, dict):
        return None
    related = metadata.get("relatedContext")
    if not related or not isinstance(related, dict) or not related.get("hits"):
        return None
    try:
        return SessionRelatedContext.model_validate(related)
    except Exception:
        return None
