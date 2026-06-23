import re

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import PriorityItem
from app.types import ContextHit, parse_github_url


async def detect_entity_matches(user_id: str, text: str) -> list[ContextHit]:
    hits: list[ContextHit] = []
    seen: set[str] = set()

    url_matches = re.findall(
        r"https?://github\.com/[^/\s]+/[^/\s]+/(?:issues|pull)/\d+",
        text,
        re.IGNORECASE,
    )
    for url in url_matches:
        parsed = parse_github_url(url)
        if not parsed:
            continue
        external_id = f"{parsed['repo']}#{parsed['number']}"
        await _add_priority_hit(user_id, external_id, hits, seen, "entity_match")

    pr_refs = re.findall(r"\b(?:PR|pull request|issue)\s*#?(\d+)\b", text, re.IGNORECASE)
    for ref in pr_refs:
        num_match = re.search(r"(\d+)", ref)
        if not num_match:
            continue
        number = int(num_match.group(1))

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(PriorityItem).where(
                    PriorityItem.userId == user_id,
                    PriorityItem.status == "open",
                )
            )
            items = result.scalars().all()

        for item in items:
            parts = item.externalId.split("#")
            item_number_str = parts[1] if len(parts) > 1 else ""
            try:
                item_number = int(item_number_str)
            except ValueError:
                continue
            if item_number != number:
                continue

            key = f"PRIORITY:{item.id}"
            if key in seen:
                continue
            seen.add(key)

            hits.append(
                ContextHit(
                    id=item.id,
                    sourceType="PRIORITY",
                    sourceId=item.id,
                    sourceRef=item.externalId,
                    purpose=item.aiSummary or f"{item.repo}#{number}: {item.title}",
                    content=item.aiSummary or item.title,
                    similarity=0.99,
                    linkReason="entity_match",
                    metadata={
                        "repo": item.repo,
                        "externalUrl": item.externalUrl,
                        "sessionId": item.sessionId,
                        "itemType": item.itemType,
                    },
                )
            )

    repo_hash_refs = re.findall(r"\b([a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)#(\d+)\b", text)
    for repo, num in repo_hash_refs:
        external_id = f"{repo}#{num}"
        await _add_priority_hit(user_id, external_id, hits, seen, "entity_match")

    return hits


async def _add_priority_hit(
    user_id: str,
    external_id: str,
    hits: list[ContextHit],
    seen: set[str],
    link_reason: str,
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.source == "github",
                PriorityItem.externalId == external_id,
            )
        )
        item = result.scalar_one_or_none()

    if not item:
        return

    key = f"PRIORITY:{item.id}"
    if key in seen:
        return
    seen.add(key)

    hits.append(
        ContextHit(
            id=item.id,
            sourceType="PRIORITY",
            sourceId=item.id,
            sourceRef=item.externalId,
            purpose=item.aiSummary or f"{item.repo}: {item.title}",
            content=item.aiSummary or item.title,
            similarity=0.99,
            linkReason=link_reason,
            metadata={
                "repo": item.repo,
                "externalUrl": item.externalUrl,
                "sessionId": item.sessionId,
                "itemType": item.itemType,
            },
        )
    )


async def find_priority_by_title_keywords(
    user_id: str,
    title: str | None,
) -> list[ContextHit]:
    if not title or not title.strip():
        return []

    skip_words = {"meeting", "review", "sync", "standup"}
    words = [
        w
        for w in title.lower().split()
        if len(w) > 3 and w not in skip_words
    ]
    if not words:
        return []

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.status == "open",
            ).limit(20)
        )
        items = result.scalars().all()

    hits: list[ContextHit] = []
    for item in items:
        haystack = f"{item.title} {item.aiSummary or ''} {item.repo}".lower()
        matches = sum(1 for w in words if w in haystack)
        if matches >= min(2, len(words)):
            hits.append(
                ContextHit(
                    id=item.id,
                    sourceType="PRIORITY",
                    sourceId=item.id,
                    sourceRef=item.externalId,
                    purpose=item.aiSummary or item.title,
                    content=item.aiSummary or item.title,
                    similarity=0.85 + matches * 0.02,
                    linkReason="entity_match",
                    metadata={
                        "repo": item.repo,
                        "externalUrl": item.externalUrl,
                        "sessionId": item.sessionId,
                        "itemType": item.itemType,
                    },
                )
            )

    hits.sort(key=lambda h: h.similarity, reverse=True)
    return hits[:3]
