"""LangGraph pipeline: load session → extract intents → classify risk → dispatch actions."""

from typing import Any

from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    CaptureSessionStatus,
    IntentType,
    RiskLevel,
)
from app.services.agent.extractor import extract_intents
from app.services.agent.graphs.state import IntentGraphState
from app.services.agent.risk_classifier import classify_risk
from app.types import Intent, SessionMessage, intent_type_to_enum


def _intent_fingerprint(intent: Intent) -> str:
    return f"{intent.type}:{intent.title.lower().strip()}"


async def _load_session(state: IntentGraphState) -> dict[str, Any]:
    session_id = state["session_id"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureSession)
            .options(
                selectinload(CaptureSession.messages),
                selectinload(CaptureSession.agentActions),
                selectinload(CaptureSession.user),
            )
            .where(CaptureSession.id == session_id)
        )
        session = result.scalar_one_or_none()

    if not session or session.status != CaptureSessionStatus.ACTIVE:
        return {"skip": True, "results": []}

    messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in session.messages
    ]

    existing_fingerprints: list[str] = []
    for action in session.agentActions:
        if action.status in (AgentActionStatus.REJECTED, AgentActionStatus.UNDONE):
            continue
        payload = action.payload or {}
        action_type = payload.get("type") or action.intentType.value.lower()
        title = (payload.get("title") or "").lower().strip()
        existing_fingerprints.append(f"{action_type}:{title}")

    return {
        "skip": False,
        "user_id": session.userId,
        "undo_window_min": session.user.undoWindowMin,
        "session_title": session.title,
        "messages": messages,
        "existing_fingerprints": existing_fingerprints,
        "results": [],
    }


async def _extract_intents(state: IntentGraphState) -> dict[str, Any]:
    if state.get("skip"):
        return {}

    extraction = await extract_intents(
        state["messages"],
        {"title": state.get("session_title")},
    )
    return {"intents": extraction.intents}


async def _dispatch_actions(state: IntentGraphState) -> dict[str, Any]:
    if state.get("skip"):
        return {}

    from app.services.agent.action_executor import execute_action

    session_id = state["session_id"]
    user_id = state["user_id"]
    undo_window_min = state["undo_window_min"]
    seen = set(state.get("existing_fingerprints") or [])
    results: list[dict[str, Any]] = []

    for intent in state.get("intents") or []:
        fp = _intent_fingerprint(intent)
        if fp in seen:
            continue
        seen.add(fp)

        risk = classify_risk(intent.model_dump())
        risk_level = RiskLevel.LOW if risk == "low" else RiskLevel.HIGH

        from app.services.llm.observability import current_trace_id

        payload = intent.model_dump()
        trace_id = current_trace_id()
        if trace_id:
            payload["langfuseTraceId"] = trace_id

        async with AsyncSessionLocal() as db:
            action = AgentAction(
                id=generate_id(),
                sessionId=session_id,
                intentType=IntentType(intent_type_to_enum(intent.type)),
                riskLevel=risk_level,
                confidence=intent.confidence,
                payload=payload,
                sourceMessageIds=intent.sourceMessageIds,
                status=AgentActionStatus.PENDING,
            )
            db.add(action)
            await db.commit()
            action_id = action.id

        if risk_level == RiskLevel.LOW:
            exec_result = await execute_action(action_id, user_id, undo_window_min)
            results.append(
                {
                    "actionId": action_id,
                    "status": "auto_executed" if exec_result["success"] else "pending",
                    "message": exec_result["message"],
                }
            )
        else:
            results.append(
                {
                    "actionId": action_id,
                    "status": "pending",
                    "message": f"Queued for confirmation: {intent.title}",
                }
            )
            try:
                from app.services.integrations.slack_approvals import notify_pending_action

                await notify_pending_action(user_id, session_id, action_id)
            except Exception as error:
                print(f"Slack approval notify failed for {action_id}: {error}")

    return {"results": results}


def _route_after_load(state: IntentGraphState) -> str:
    if state.get("skip"):
        return END
    return "extract_intents"


def build_intent_graph():
    graph = StateGraph(IntentGraphState)

    graph.add_node("load_session", _load_session)
    graph.add_node("extract_intents", _extract_intents)
    graph.add_node("dispatch_actions", _dispatch_actions)

    graph.add_edge(START, "load_session")
    graph.add_conditional_edges(
        "load_session",
        _route_after_load,
        {"extract_intents": "extract_intents", END: END},
    )
    graph.add_edge("extract_intents", "dispatch_actions")
    graph.add_edge("dispatch_actions", END)

    return graph.compile()


_intent_graph = None


def get_intent_graph():
    global _intent_graph
    if _intent_graph is None:
        _intent_graph = build_intent_graph()
    return _intent_graph


async def run_intent_graph(session_id: str) -> list[dict[str, Any]]:
    from app.services.llm.observability import (
        langfuse_enabled,
        load_session_trace_context,
        trace_graph_run,
    )

    graph = get_intent_graph()
    trace_ctx = await load_session_trace_context(session_id)

    if langfuse_enabled():
        with trace_graph_run(
            graph_name="intent_graph",
            session_id=trace_ctx["session_id"] or session_id,
            user_id=trace_ctx.get("user_id"),
            source_type=trace_ctx.get("source_type"),
            session_title=trace_ctx.get("session_title"),
        ) as config:
            result = await graph.ainvoke({"session_id": session_id}, config=config)
    else:
        result = await graph.ainvoke({"session_id": session_id})

    return result.get("results") or []
