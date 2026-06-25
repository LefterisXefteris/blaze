"""Policy engine — risk classification and action dispatch."""

from __future__ import annotations

from typing import Any

from app.core.ids import generate_id
from app.database import AsyncSessionLocal
from app.models import AgentAction, AgentActionStatus, IntentType, RiskLevel
from app.policy.rules import classify_risk
from app.types import Intent, intent_type_to_enum


def intent_fingerprint(intent: Intent) -> str:
    return f"{intent.type}:{intent.title.lower().strip()}"


class PolicyEngine:
    def classify(self, intent: dict[str, Any]) -> str:
        return classify_risk(intent)

    def should_auto_execute(self, risk: str, *, user_settings: dict[str, Any] | None = None) -> bool:
        if risk != "low":
            return False
        settings = user_settings or {}
        if settings.get("slackApprovals") is False:
            return True
        return True

    async def persist_and_dispatch(
        self,
        session_id: str,
        user_id: str,
        undo_window_min: int,
        intents: list[Intent],
        existing_fingerprints: list[str],
    ) -> list[dict[str, Any]]:
        from app.services.agent.action_executor import execute_action

        seen = set(existing_fingerprints)
        results: list[dict[str, Any]] = []

        for intent in intents:
            fp = intent_fingerprint(intent)
            if fp in seen:
                continue
            seen.add(fp)

            risk = self.classify(intent.model_dump())
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

        return results


_policy_engine: PolicyEngine | None = None


def get_policy_engine() -> PolicyEngine:
    global _policy_engine
    if _policy_engine is None:
        _policy_engine = PolicyEngine()
    return _policy_engine
