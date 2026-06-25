"""LangGraph pipeline: load session → retrieve context → index → generate live summary."""

from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import CaptureSession, CaptureSessionStatus, CaptureSourceType
from app.services.agent.extractor import generate_live_summary
from app.services.agent.graphs.state import LiveNotesGraphState
from app.services.vector.context import persist_related_context, retrieve_meeting_context
from app.services.vector.indexer import index_live_meeting_transcript
from app.types import SessionMessage

MEETING_SOURCE_TYPES = {
    CaptureSourceType.MEETING,
    CaptureSourceType.SLACK,
    CaptureSourceType.MANUAL,
}


async def _load_session(state: LiveNotesGraphState) -> dict[str, Any]:
    session_id = state["session_id"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(selectinload(CaptureSession.messages))
            .where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if not session or session.status != CaptureSessionStatus.ACTIVE:
        return {"skip": True}

    messages = [
        {
            "id": m.id,
            "speaker": m.speaker,
            "content": m.content,
            "sentAt": m.sentAt,
        }
        for m in session.messages
    ]

    session_messages = [
        SessionMessage(
            id=m["id"],
            speaker=m["speaker"],
            content=m["content"],
            sentAt=m["sentAt"],
        )
        for m in messages
    ]

    source_type = (
        session.sourceType.value
        if hasattr(session.sourceType, "value")
        else str(session.sourceType)
    )

    return {
        "skip": False,
        "user_id": session.userId,
        "session_title": session.title,
        "source_type": source_type,
        "user_notes": session.userNotes,
        "messages": messages,
        "session_messages": session_messages,
        "is_meeting": session.sourceType in MEETING_SOURCE_TYPES,
        "related_context_prompt": "",
    }


async def _retrieve_context(state: LiveNotesGraphState) -> dict[str, Any]:
    if state.get("skip") or not state.get("is_meeting"):
        return {}

    msg_dicts = [{"speaker": m["speaker"], "content": m["content"]} for m in state["messages"]]

    related_context = await retrieve_meeting_context(
        user_id=state["user_id"],
        session_id=state["session_id"],
        title=state.get("session_title"),
        user_notes=state["user_notes"],
        messages=msg_dicts,
    )
    await persist_related_context(state["session_id"], related_context)

    return {"related_context_prompt": related_context.promptText}


async def _index_transcript(state: LiveNotesGraphState) -> dict[str, Any]:
    if state.get("skip") or not state.get("is_meeting"):
        return {}

    msg_dicts = [{"speaker": m["speaker"], "content": m["content"]} for m in state["messages"]]

    try:
        await index_live_meeting_transcript(
            user_id=state["user_id"],
            session_id=state["session_id"],
            title=state.get("session_title"),
            user_notes=state["user_notes"],
            messages=msg_dicts,
        )
    except Exception as error:
        print(f"Meeting index failed for {state['session_id']}: {error}")

    return {}


async def _generate_summary(state: LiveNotesGraphState) -> dict[str, Any]:
    if state.get("skip"):
        return {}

    live_summary = await generate_live_summary(
        state["session_messages"],
        state["user_notes"],
        {
            "title": state.get("session_title"),
            "sourceType": state.get("source_type"),
        },
        state.get("related_context_prompt") or None,
    )
    return {"live_summary": live_summary}


async def _save_summary(state: LiveNotesGraphState) -> dict[str, Any]:
    if state.get("skip") or not state.get("live_summary"):
        return {}

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == state["session_id"])
        )
        row = result.scalar_one()
        row.liveSummary = state["live_summary"]
        await db.commit()

    if state.get("source_type") == CaptureSourceType.SLACK.value:
        try:
            from app.services.integrations.slack_approvals import post_or_update_live_notes

            await post_or_update_live_notes(state["session_id"], state["live_summary"])
        except Exception as error:
            print(f"Slack live notes sync failed for {state['session_id']}: {error}")

    return {}


def _route_after_load(state: LiveNotesGraphState) -> str:
    if state.get("skip"):
        return END
    if state.get("is_meeting"):
        return "retrieve_context"
    return "generate_summary"


def build_live_notes_graph():
    graph = StateGraph(LiveNotesGraphState)

    graph.add_node("load_session", _load_session)
    graph.add_node("retrieve_context", _retrieve_context)
    graph.add_node("index_transcript", _index_transcript)
    graph.add_node("generate_summary", _generate_summary)
    graph.add_node("save_summary", _save_summary)

    graph.add_edge(START, "load_session")
    graph.add_conditional_edges(
        "load_session",
        _route_after_load,
        {
            "retrieve_context": "retrieve_context",
            "generate_summary": "generate_summary",
            END: END,
        },
    )
    graph.add_edge("retrieve_context", "index_transcript")
    graph.add_edge("index_transcript", "generate_summary")
    graph.add_edge("generate_summary", "save_summary")
    graph.add_edge("save_summary", END)

    return graph.compile()


_live_notes_graph = None


def get_live_notes_graph():
    global _live_notes_graph
    if _live_notes_graph is None:
        _live_notes_graph = build_live_notes_graph()
    return _live_notes_graph


async def run_live_notes_graph(session_id: str) -> None:
    from app.services.llm.observability import (
        langfuse_enabled,
        load_session_trace_context,
        should_trace_live_notes,
        trace_graph_run,
    )

    graph = get_live_notes_graph()
    trace_ctx = await load_session_trace_context(session_id)

    if langfuse_enabled() and should_trace_live_notes():
        with trace_graph_run(
            graph_name="live_notes_graph",
            session_id=trace_ctx["session_id"] or session_id,
            user_id=trace_ctx.get("user_id"),
            source_type=trace_ctx.get("source_type"),
            session_title=trace_ctx.get("session_title"),
        ) as config:
            await graph.ainvoke({"session_id": session_id}, config=config)
    else:
        await graph.ainvoke({"session_id": session_id})
