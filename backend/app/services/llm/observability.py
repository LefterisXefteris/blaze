"""Langfuse tracing helpers for Blaze agent pipelines."""

from __future__ import annotations

import random
from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import CaptureSession


def langfuse_enabled() -> bool:
    settings = get_settings()
    if not settings.langfuse_enabled:
        return False
    return bool(settings.langfuse_public_key and settings.langfuse_secret_key)


async def load_session_trace_context(session_id: str) -> dict[str, str | None]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if not session:
        return {
            "session_id": session_id,
            "user_id": None,
            "source_type": None,
            "session_title": None,
        }

    source_type = (
        session.sourceType.value
        if hasattr(session.sourceType, "value")
        else str(session.sourceType)
    )
    return {
        "session_id": session_id,
        "user_id": session.userId,
        "source_type": source_type,
        "session_title": session.title,
    }


def should_trace_live_notes() -> bool:
    """Sample live-notes traces to limit self-hosted storage churn."""
    settings = get_settings()
    rate = settings.langfuse_live_notes_sample_rate
    if rate >= 1.0:
        return True
    if rate <= 0.0:
        return False
    return random.random() < rate


def get_langfuse_client():
    if not langfuse_enabled():
        return None
    from langfuse import get_client

    return get_client()


def get_langfuse_callback_handler():
    if not langfuse_enabled():
        return None
    from langfuse.langchain import CallbackHandler

    return CallbackHandler()


def current_trace_id() -> str | None:
    client = get_langfuse_client()
    if not client:
        return None
    try:
        return client.get_current_trace_id()
    except Exception:
        return None


def record_llm_fallback(
    *,
    operation: str,
    reason: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Surface silent rule-based fallbacks as Langfuse events."""
    client = get_langfuse_client()
    if not client:
        return
    try:
        client.create_event(
            name="llm_fallback",
            level="WARNING",
            metadata={
                "operation": operation,
                "reason": reason,
                **(metadata or {}),
            },
        )
    except Exception as error:
        print(f"Langfuse fallback event failed ({operation}): {error}")


def record_action_rejection_score(
    *,
    trace_id: str | None,
    action_id: str,
    session_id: str,
    intent_type: str,
    title: str,
) -> None:
    client = get_langfuse_client()
    if not client or not trace_id:
        return
    try:
        client.create_score(
            trace_id=trace_id,
            name="intent_rejected",
            value=0,
            comment=f"User rejected {intent_type}: {title}",
            metadata={
                "action_id": action_id,
                "session_id": session_id,
                "intent_type": intent_type,
            },
        )
    except Exception as error:
        print(f"Langfuse rejection score failed for action {action_id}: {error}")


@contextmanager
def trace_graph_run(
    *,
    graph_name: str,
    session_id: str,
    user_id: str | None = None,
    source_type: str | None = None,
    session_title: str | None = None,
) -> Iterator[dict[str, Any]]:
    """Wrap a LangGraph ainvoke with Langfuse trace attributes."""
    if not langfuse_enabled():
        yield {}
        return

    from langfuse import propagate_attributes

    metadata: dict[str, Any] = {"graph": graph_name}
    if source_type:
        metadata["source_type"] = source_type
    if session_title:
        metadata["session_title"] = session_title

    tags = [graph_name]
    if source_type:
        tags.append(f"source:{source_type.lower()}")

    with propagate_attributes(
        session_id=session_id,
        user_id=user_id,
        tags=tags,
        metadata=metadata,
    ):
        handler = get_langfuse_callback_handler()
        config: dict[str, Any] = {}
        if handler:
            config["callbacks"] = [handler]
        yield config

    client = get_langfuse_client()
    if client:
        try:
            client.flush()
        except Exception:
            pass
