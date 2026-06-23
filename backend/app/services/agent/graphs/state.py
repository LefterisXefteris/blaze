"""LangGraph state types for Blaze agent pipelines."""

import operator
from typing import Annotated, Any, TypedDict

from app.types import Intent, SessionMessage


class IntentGraphState(TypedDict, total=False):
    session_id: str
    user_id: str
    undo_window_min: int
    session_title: str | None
    messages: list[SessionMessage]
    existing_fingerprints: list[str]
    intents: list[Intent]
    results: Annotated[list[dict[str, Any]], operator.add]
    skip: bool


class LiveNotesGraphState(TypedDict, total=False):
    session_id: str
    user_id: str
    session_title: str | None
    source_type: str
    user_notes: str
    messages: list[dict[str, Any]]
    session_messages: list[SessionMessage]
    is_meeting: bool
    related_context_prompt: str
    live_summary: str
    skip: bool
