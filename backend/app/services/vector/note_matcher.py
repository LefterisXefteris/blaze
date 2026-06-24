"""Match pasted transcripts to priority inbox items via entity + semantic search."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import PriorityItem
from app.services.vector.entities import (
    detect_entity_matches,
    find_priority_by_text_keywords,
)
from app.services.vector.search import semantic_search
from app.types import ContextHit
from app.utils import parse_manual_transcript


@dataclass
class TranscriptChunk:
    text: str
    start: int
    end: int


@dataclass
class TranscriptMatch:
    priority_item_id: str
    similarity: float
    match_reason: str
    excerpt: str | None = None
    excerpt_start: int | None = None
    excerpt_end: int | None = None


def split_transcript_chunks(text: str, max_chunk_chars: int = 600) -> list[TranscriptChunk]:
    normalized = text.strip()
    if not normalized:
        return []

    messages = parse_manual_transcript(normalized)
    if len(messages) >= 2:
        chunks: list[TranscriptChunk] = []
        search_from = 0
        for msg in messages:
            line = f"{msg['speaker']}: {msg['content']}"
            start = normalized.find(line, search_from)
            if start < 0:
                start = search_from
            end = start + len(line)
            chunks.append(TranscriptChunk(text=line, start=start, end=end))
            search_from = end
        return chunks

    paragraphs = re.split(r"\n{2,}", normalized)
    if len(paragraphs) > 1:
        chunks = []
        offset = 0
        for para in paragraphs:
            piece = para.strip()
            if not piece:
                offset += len(para) + 2
                continue
            start = normalized.find(piece, offset)
            if start < 0:
                start = offset
            end = start + len(piece)
            chunks.append(TranscriptChunk(text=piece, start=start, end=end))
            offset = end
        return chunks

    if len(normalized) <= max_chunk_chars:
        return [TranscriptChunk(text=normalized, start=0, end=len(normalized))]

    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    chunks = []
    current = ""
    current_start = 0
    pos = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        sentence_start = normalized.find(sentence, pos)
        if sentence_start < 0:
            sentence_start = pos

        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) > max_chunk_chars and current:
            chunks.append(
                TranscriptChunk(text=current, start=current_start, end=current_start + len(current))
            )
            current = sentence
            current_start = sentence_start
        else:
            if not current:
                current_start = sentence_start
            current = candidate
        pos = sentence_start + len(sentence)

    if current.strip():
        chunks.append(
            TranscriptChunk(text=current.strip(), start=current_start, end=current_start + len(current))
        )

    return chunks or [TranscriptChunk(text=normalized, start=0, end=len(normalized))]


async def _load_open_priority_items(user_id: str) -> dict[str, PriorityItem]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.source == "github",
                PriorityItem.status == "open",
            )
        )
        items = result.scalars().all()
    return {item.id: item for item in items}


async def _resolve_hit_to_priority(
    hit: ContextHit,
    items_by_id: dict[str, PriorityItem],
    items_by_external: dict[str, PriorityItem],
    items_by_session: dict[str, PriorityItem],
) -> PriorityItem | None:
    if hit.sourceType == "PRIORITY":
        return items_by_id.get(hit.sourceId)

    if hit.sourceType == "GITHUB":
        meta = hit.metadata or {}
        priority_id = meta.get("priorityItemId")
        if priority_id and priority_id in items_by_id:
            return items_by_id[priority_id]
        if hit.sourceRef and hit.sourceRef in items_by_external:
            return items_by_external[hit.sourceRef]
        if hit.sourceId in items_by_session:
            return items_by_session[hit.sourceId]

    return None


def _merge_match(
    matches: dict[str, TranscriptMatch],
    item: PriorityItem,
    similarity: float,
    match_reason: str,
    chunk: TranscriptChunk | None = None,
) -> None:
    existing = matches.get(item.id)
    excerpt = chunk.text.strip() if chunk else None
    excerpt_start = chunk.start if chunk else None
    excerpt_end = chunk.end if chunk else None

    if existing:
        if similarity > existing.similarity:
            existing.similarity = similarity
            existing.match_reason = match_reason
            if chunk:
                existing.excerpt = excerpt
                existing.excerpt_start = excerpt_start
                existing.excerpt_end = excerpt_end
        return

    matches[item.id] = TranscriptMatch(
        priority_item_id=item.id,
        similarity=similarity,
        match_reason=match_reason,
        excerpt=excerpt,
        excerpt_start=excerpt_start,
        excerpt_end=excerpt_end,
    )


async def match_transcript_to_priorities(user_id: str, text: str) -> list[TranscriptMatch]:
    if not text.strip():
        return []

    items_by_id = await _load_open_priority_items(user_id)
    if not items_by_id:
        return []

    items_by_external = {item.externalId: item for item in items_by_id.values()}
    items_by_session = {
        item.sessionId: item for item in items_by_id.values() if item.sessionId
    }

    matches: dict[str, TranscriptMatch] = {}

    entity_hits = await detect_entity_matches(user_id, text)
    for hit in entity_hits:
        item = await _resolve_hit_to_priority(
            hit, items_by_id, items_by_external, items_by_session
        )
        if item:
            _merge_match(matches, item, hit.similarity, hit.linkReason)

    keyword_hits = await find_priority_by_text_keywords(user_id, text)
    text_chunk = split_transcript_chunks(text)
    excerpt_chunk = text_chunk[0] if text_chunk else None
    for hit in keyword_hits:
        item = await _resolve_hit_to_priority(
            hit, items_by_id, items_by_external, items_by_session
        )
        if item:
            _merge_match(
                matches,
                item,
                hit.similarity,
                hit.linkReason,
                excerpt_chunk,
            )

    chunks = text_chunk
    for chunk in chunks:
        if len(chunk.text.strip()) < 20:
            continue
        semantic_hits = await semantic_search(
            user_id=user_id,
            query=chunk.text,
            top_k=3,
            source_types=["PRIORITY", "GITHUB"],
            min_similarity=0.68,
        )
        for hit in semantic_hits:
            item = await _resolve_hit_to_priority(
                hit, items_by_id, items_by_external, items_by_session
            )
            if item:
                _merge_match(matches, item, hit.similarity, hit.linkReason, chunk)

    if not matches:
        return []

    ordered = sorted(
        matches.values(),
        key=lambda m: (
            items_by_id[m.priority_item_id].priority,
            -m.similarity,
        ),
    )
    return ordered[:8]
