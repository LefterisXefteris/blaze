from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.vector.embed import embed_text
from app.services.vector.entities import detect_entity_matches
from app.types import ContextHit, SIMILARITY_THRESHOLD


async def semantic_search(
    user_id: str,
    query: str,
    top_k: int = 5,
    source_types: list[str] | None = None,
    min_similarity: float | None = None,
) -> list[ContextHit]:
    embedding = await embed_text(query)
    if not embedding:
        return []

    top_k = top_k or 5
    min_sim = min_similarity if min_similarity is not None else SIMILARITY_THRESHOLD
    vector_literal = f"[{','.join(str(x) for x in embedding)}]"

    async with AsyncSessionLocal() as db:
        if source_types:
            result = await db.execute(
                text(
                    """
                    SELECT
                      id,
                      "sourceType",
                      "sourceId",
                      "sourceRef",
                      purpose,
                      content,
                      metadata,
                      1 - (embedding <=> :vec::vector) AS similarity
                    FROM "ContextChunk"
                    WHERE "userId" = :user_id::uuid
                      AND embedding IS NOT NULL
                      AND "sourceType"::text = ANY(:source_types)
                    ORDER BY embedding <=> :vec::vector
                    LIMIT :top_k
                    """
                ),
                {
                    "vec": vector_literal,
                    "user_id": user_id,
                    "top_k": top_k,
                    "source_types": source_types,
                },
            )
        else:
            result = await db.execute(
                text(
                    """
                    SELECT
                      id,
                      "sourceType",
                      "sourceId",
                      "sourceRef",
                      purpose,
                      content,
                      metadata,
                      1 - (embedding <=> :vec::vector) AS similarity
                    FROM "ContextChunk"
                    WHERE "userId" = :user_id::uuid
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> :vec::vector
                    LIMIT :top_k
                    """
                ),
                {"vec": vector_literal, "user_id": user_id, "top_k": top_k},
            )
        rows = result.mappings().all()

    hits: list[ContextHit] = []
    for row in rows:
        similarity = float(row["similarity"])
        if similarity < min_sim:
            continue
        source_type = row["sourceType"]
        if hasattr(source_type, "value"):
            source_type = source_type.value
        hits.append(
            ContextHit(
                id=row["id"],
                sourceType=source_type,
                sourceId=row["sourceId"],
                sourceRef=row["sourceRef"],
                purpose=row["purpose"],
                content=row["content"],
                similarity=similarity,
                linkReason="semantic",
                metadata=row["metadata"],
            )
        )
    return hits


async def search_context(
    user_id: str,
    query: str,
    top_k: int = 5,
) -> list[ContextHit]:
    semantic = await semantic_search(user_id=user_id, query=query, top_k=top_k)
    entity = await detect_entity_matches(user_id, query)

    seen: set[str] = set()
    merged: list[ContextHit] = []

    for hit in entity + semantic:
        key = f"{hit.sourceType}:{hit.sourceId}"
        if key in seen:
            continue
        seen.add(key)
        merged.append(hit)

    merged.sort(key=lambda h: h.similarity, reverse=True)
    return merged[:top_k]


def format_context_for_prompt(hits: list[ContextHit]) -> str:
    if not hits:
        return ""

    lines: list[str] = []
    for hit in hits:
        if hit.sourceType in ("GITHUB", "PRIORITY"):
            label = "GitHub"
        elif hit.sourceType == "MEETING":
            label = "Meeting"
        else:
            label = "Note"
        ref = f" ({hit.sourceRef})" if hit.sourceRef else ""
        reason = (
            "matched by PR/issue reference"
            if hit.linkReason == "entity_match"
            else f"{round(hit.similarity * 100)}% match"
        )
        summary = hit.purpose or hit.content[:280]
        lines.append(f"- [{label}{ref}] {summary} — {reason}")

    return "\n".join(lines)
