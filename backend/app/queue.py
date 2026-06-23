import asyncio
import json
from typing import Any

from app.config import get_settings

DEBOUNCE_MS = 2.0
LIVE_NOTES_DEBOUNCE_MS = 4.0

_pending_jobs: dict[str, asyncio.Task] = {}
_pending_live_notes: dict[str, asyncio.Task] = {}
_pending_note_analysis: dict[str, asyncio.Task] = {}
_redis_client: Any = None
_redis_disabled = False

NOTE_ANALYSIS_DEBOUNCE_MS = 1.5


async def _get_redis():
    global _redis_client, _redis_disabled
    if _redis_disabled:
        return None
    settings = get_settings()
    if not settings.redis_url:
        return None
    if _redis_client:
        return _redis_client
    try:
        import redis.asyncio as redis

        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        await _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_disabled = True
        _redis_client = None
        return None


async def _run_intent_extraction(session_id: str) -> None:
    from app.services.agent.action_executor import process_session_intents

    try:
        await process_session_intents(session_id)
    except Exception as error:
        print(f"Intent extraction failed for {session_id}: {error}")


async def _run_live_notes(session_id: str) -> None:
    from app.services.agent.live_notes import update_session_live_summary

    try:
        await update_session_live_summary(session_id)
    except Exception as error:
        print(f"Live notes update failed for {session_id}: {error}")


def schedule_intent_extraction(session_id: str) -> None:
    existing = _pending_jobs.pop(session_id, None)
    if existing and not existing.done():
        existing.cancel()

    async def _delayed() -> None:
        await asyncio.sleep(DEBOUNCE_MS)
        _pending_jobs.pop(session_id, None)
        await _run_intent_extraction(session_id)

    _pending_jobs[session_id] = asyncio.create_task(_delayed())


def schedule_live_notes_update(session_id: str) -> None:
    existing = _pending_live_notes.pop(session_id, None)
    if existing and not existing.done():
        existing.cancel()

    async def _delayed() -> None:
        await asyncio.sleep(LIVE_NOTES_DEBOUNCE_MS)
        _pending_live_notes.pop(session_id, None)
        await _run_live_notes(session_id)

    _pending_live_notes[session_id] = asyncio.create_task(_delayed())


async def _run_note_analysis(
    user_id: str,
    session_id: str,
    note_title: str,
    note_content: str,
    priority_item_ids: list[str],
    excerpts: dict[str, str],
) -> None:
    from app.services.agent.note_agent import analyze_note_for_priority

    for priority_item_id in priority_item_ids:
        try:
            excerpt = excerpts.get(priority_item_id)
            await analyze_note_for_priority(
                user_id=user_id,
                session_id=session_id,
                priority_item_id=priority_item_id,
                note_title=note_title,
                note_content=excerpt or note_content,
            )
        except Exception as error:
            print(
                f"Note analysis failed for {session_id} / {priority_item_id}: {error}"
            )


def schedule_note_analysis(
    user_id: str,
    session_id: str,
    note_title: str,
    note_content: str,
    priority_item_ids: list[str],
    excerpts: dict[str, str] | None = None,
) -> None:
    existing = _pending_note_analysis.pop(session_id, None)
    if existing and not existing.done():
        existing.cancel()

    excerpt_map = excerpts or {}

    async def _delayed() -> None:
        await asyncio.sleep(NOTE_ANALYSIS_DEBOUNCE_MS)
        _pending_note_analysis.pop(session_id, None)
        await _run_note_analysis(
            user_id=user_id,
            session_id=session_id,
            note_title=note_title,
            note_content=note_content,
            priority_item_ids=priority_item_ids,
            excerpts=excerpt_map,
        )

    _pending_note_analysis[session_id] = asyncio.create_task(_delayed())


async def enqueue_note_analysis(
    user_id: str,
    session_id: str,
    note_title: str,
    note_content: str,
    priority_item_ids: list[str],
    excerpts: dict[str, str] | None = None,
) -> None:
    schedule_note_analysis(
        user_id=user_id,
        session_id=session_id,
        note_title=note_title,
        note_content=note_content,
        priority_item_ids=priority_item_ids,
        excerpts=excerpts,
    )


async def enqueue_intent_extraction(session_id: str) -> None:
    redis = await _get_redis()
    if redis:
        try:
            payload = json.dumps({"sessionId": session_id})
            await redis.lpush("intent-extraction:queue", payload)
            return
        except Exception:
            global _redis_disabled
            _redis_disabled = True

    schedule_intent_extraction(session_id)
