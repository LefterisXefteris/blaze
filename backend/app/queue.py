"""In-process debounced scheduling for the Blaze agent pipeline."""

from __future__ import annotations

import asyncio
from typing import Any

DEBOUNCE_SEC = 3.0

_pending: dict[str, asyncio.Task] = {}
_pending_context: dict[str, dict[str, Any]] = {}


async def _run_pipeline(session_id: str) -> None:
    from app.services.agent.blaze_pipeline import process_session

    ctx = _pending_context.pop(session_id, {})
    try:
        await process_session(session_id, **ctx)
    except Exception as error:
        print(f"Blaze pipeline failed for {session_id}: {error}")


def schedule_session_pipeline(
    session_id: str,
    *,
    note_title: str | None = None,
    note_content: str | None = None,
    priority_item_ids: list[str] | None = None,
    excerpts: dict[str, str] | None = None,
) -> None:
    if note_title or note_content or priority_item_ids:
        _pending_context[session_id] = {
            "note_title": note_title,
            "note_content": note_content,
            "priority_item_ids": priority_item_ids or [],
            "excerpts": excerpts or {},
        }

    existing = _pending.pop(session_id, None)
    if existing and not existing.done():
        existing.cancel()

    async def _delayed() -> None:
        await asyncio.sleep(DEBOUNCE_SEC)
        _pending.pop(session_id, None)
        await _run_pipeline(session_id)

    _pending[session_id] = asyncio.create_task(_delayed())


async def enqueue_note_analysis(
    user_id: str,
    session_id: str,
    note_title: str,
    note_content: str,
    priority_item_ids: list[str],
    excerpts: dict[str, str] | None = None,
) -> None:
    schedule_session_pipeline(
        session_id,
        note_title=note_title,
        note_content=note_content,
        priority_item_ids=priority_item_ids,
        excerpts=excerpts,
    )
