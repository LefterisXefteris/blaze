import secrets

from sqlalchemy import delete, select, text

from app.database import AsyncSessionLocal
from app.models import ContextChunk, ContextSourceType
from app.services.vector.embed import embed_text, vector_to_sql
from app.types import IndexChunkInput


def new_id() -> str:
    return secrets.token_hex(12)


async def upsert_context_chunk(input: IndexChunkInput) -> str | None:
    embed_input = (
        f"{input.purpose}\n\n{input.content}" if input.purpose else input.content
    )
    embedding = await embed_text(embed_input)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ContextChunk).where(
                ContextChunk.userId == input.userId,
                ContextChunk.sourceType == ContextSourceType(input.sourceType),
                ContextChunk.sourceId == input.sourceId,
                ContextChunk.chunkIndex == input.chunkIndex,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.sourceRef = input.sourceRef
            existing.content = input.content
            existing.purpose = input.purpose
            existing.metadata_ = input.metadata or {}
            chunk = existing
        else:
            chunk = ContextChunk(
                id=new_id(),
                userId=input.userId,
                sourceType=ContextSourceType(input.sourceType),
                sourceId=input.sourceId,
                sourceRef=input.sourceRef,
                chunkIndex=input.chunkIndex,
                content=input.content,
                purpose=input.purpose,
                metadata_=input.metadata or {},
            )
            db.add(chunk)

        await db.flush()

        if embedding:
            vector_sql = vector_to_sql(embedding)
            await db.execute(
                text("UPDATE \"ContextChunk\" SET embedding = :vec::vector WHERE id = :id"),
                {"vec": vector_sql, "id": chunk.id},
            )

        await db.commit()
        return chunk.id


async def delete_context_chunks_for_source(
    user_id: str,
    source_type: str,
    source_id: str,
) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(ContextChunk).where(
                ContextChunk.userId == user_id,
                ContextChunk.sourceType == ContextSourceType(source_type),
                ContextChunk.sourceId == source_id,
            )
        )
        await db.commit()


async def index_chunks(inputs: list[IndexChunkInput]) -> None:
    if not inputs:
        return

    first = inputs[0]
    await delete_context_chunks_for_source(first.userId, first.sourceType, first.sourceId)

    for input in inputs:
        await upsert_context_chunk(input)
