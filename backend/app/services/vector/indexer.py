from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Message
from app.services.vector.chunks import build_github_index_text, build_meeting_index_text
from app.services.vector.store import index_chunks
from app.types import IndexChunkInput


async def index_github_session(
    user_id: str,
    session_id: str,
    source_ref: str,
    repo: str,
    number: int,
    title: str,
    item_type: str,
    ai_summary: str | None = None,
    body: str | None = None,
    priority_item_id: str | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Message).where(Message.sessionId == session_id).order_by(Message.sentAt)
        )
        messages = result.scalars().all()

    comments = [{"speaker": m.speaker, "content": m.content} for m in messages]
    index_data = build_github_index_text(
        repo=repo,
        number=number,
        title=title,
        item_type=item_type,
        ai_summary=ai_summary,
        body=body,
        comments=comments,
    )
    purpose = str(index_data["purpose"])
    chunks = index_data["chunks"]

    metadata = {
        "repo": repo,
        "number": number,
        "title": title,
        "itemType": item_type,
        "sessionId": session_id,
        "priorityItemId": priority_item_id,
    }

    session_inputs = [
        IndexChunkInput(
            userId=user_id,
            sourceType="GITHUB",
            sourceId=session_id,
            sourceRef=source_ref,
            chunkIndex=i,
            content=content,
            purpose=purpose,
            metadata=metadata,
        )
        for i, content in enumerate(chunks)
    ]
    await index_chunks(session_inputs)

    if priority_item_id:
        priority_inputs = [
            IndexChunkInput(
                userId=user_id,
                sourceType="PRIORITY",
                sourceId=priority_item_id,
                sourceRef=source_ref,
                chunkIndex=i,
                content=content,
                purpose=purpose,
                metadata=metadata,
            )
            for i, content in enumerate(chunks)
        ]
        await index_chunks(priority_inputs)


async def index_meeting_session(
    user_id: str,
    session_id: str,
    ai_summary: str,
    title: str | None = None,
    structured: dict | None = None,
) -> None:
    structured = structured or {}
    index_data = build_meeting_index_text(
        ai_summary=ai_summary,
        title=title,
        decisions=structured.get("decisions"),
        action_items=structured.get("actionItems"),
    )
    purpose = str(index_data["purpose"])
    chunks = index_data["chunks"]

    inputs = [
        IndexChunkInput(
            userId=user_id,
            sourceType="MEETING",
            sourceId=session_id,
            sourceRef=None,
            chunkIndex=i,
            content=content,
            purpose=purpose,
            metadata={"sessionId": session_id, "title": title},
        )
        for i, content in enumerate(chunks)
    ]
    await index_chunks(inputs)


async def index_live_meeting_transcript_incremental(
    user_id: str,
    session_id: str,
    user_notes: str,
    messages: list[dict[str, str]],
    title: str | None = None,
    message_ids: list[str] | None = None,
) -> None:
    """Incremental live index — upserts chunk 0 without full delete."""
    if not messages and not user_notes.strip():
        return

    transcript = "\n".join(
        f"{m['speaker']}: {m['content']}" for m in messages[-20:]
    )
    content_parts = [
        f"Meeting: {title}" if title else None,
        f"Notes:\n{user_notes.strip()}" if user_notes.strip() else None,
        f"Recent transcript:\n{transcript}" if transcript else None,
    ]
    content = "\n\n".join(p for p in content_parts if p)
    purpose = f"Live meeting: {title}" if title else "Live meeting in progress"

    from app.services.vector.store import upsert_context_chunk

    await upsert_context_chunk(
        IndexChunkInput(
            userId=user_id,
            sourceType="MEETING",
            sourceId=session_id,
            sourceRef=None,
            chunkIndex=0,
            content=content,
            purpose=purpose,
            metadata={
                "sessionId": session_id,
                "live": True,
                "messageIds": message_ids or [],
            },
        )
    )


async def index_live_meeting_transcript(
    user_id: str,
    session_id: str,
    user_notes: str,
    messages: list[dict[str, str]],
    title: str | None = None,
) -> None:
    if not messages and not user_notes.strip():
        return

    transcript = "\n".join(
        f"{m['speaker']}: {m['content']}" for m in messages[-20:]
    )
    content_parts = [
        f"Meeting: {title}" if title else None,
        f"Notes:\n{user_notes.strip()}" if user_notes.strip() else None,
        f"Recent transcript:\n{transcript}" if transcript else None,
    ]
    content = "\n\n".join(p for p in content_parts if p)
    purpose = f"Live meeting: {title}" if title else "Live meeting in progress"

    await index_chunks(
        [
            IndexChunkInput(
                userId=user_id,
                sourceType="MEETING",
                sourceId=session_id,
                sourceRef=None,
                chunkIndex=0,
                content=content,
                purpose=purpose,
                metadata={"sessionId": session_id, "live": True},
            )
        ]
    )
