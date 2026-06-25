import json

from sqlalchemy import select

from app.core.ids import generate_id

from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    IntentType,
    PriorityItem,
    RiskLevel,
)
from app.services.llm.client import get_openai_client
from app.services.vector.context import link_priority_to_session
from app.types import Intent
from app.utils import serialize_model


def _parse_external_id(external_id: str) -> tuple[str, int] | None:
    if "#" not in external_id:
        return None
    repo, num = external_id.rsplit("#", 1)
    if not repo or not num.isdigit():
        return None
    return repo, int(num)


def _default_note_plan(
    note_title: str,
    note_content: str,
    repo: str,
    issue_number: int,
    issue_title: str,
) -> Intent:
    combined = f"{note_title}\n{note_content}".strip().lower()
    if any(w in combined for w in ("done", "resolved", "close", "finished", "complete")):
        suggested = "mark_done"
        summary = f'Your note suggests wrapping up "{issue_title}".'
    elif any(w in combined for w in ("comment", "reply", "respond", "post", "say")):
        suggested = "follow_up_comment"
        summary = f'Your note implies posting a follow-up on "{issue_title}".'
    else:
        suggested = "handoff_coding"
        summary = f'Your note references "{issue_title}" — hand off to your local coding agent.'

    return Intent(
        type="github_next_steps",
        title=f"Action on {repo}#{issue_number}",
        summary=summary,
        steps=[
            "Review the handoff context (issue, notes, transcript)",
            "Approve to write a .md file and open it in Cursor",
            "Cursor gets a .cursor/rules snippet with the active handoff path",
        ],
        suggestedAction=suggested,
        draftFollowUp=_draft_from_note(note_content, issue_title),
        repo=repo,
        issueNumber=issue_number,
        risk="high",
        confidence=0.75,
        sourceMessageIds=[],
    )


def _draft_from_note(note_content: str, issue_title: str) -> str:
    lines = [ln.strip() for ln in note_content.splitlines() if ln.strip()]
    if not lines:
        return f'Following up on "{issue_title}" — sharing an update shortly.'
    for line in reversed(lines):
        if "#" in line and "/" in line:
            continue
        if len(line) > 20:
            return line
    return lines[-1]


async def extract_note_issue_plan(
    note_title: str,
    note_content: str,
    repo: str,
    issue_number: int,
    issue_title: str,
    issue_summary: str | None,
) -> Intent:
    openai = get_openai_client()
    if not openai:
        return _default_note_plan(
            note_title, note_content, repo, issue_number, issue_title
        )

    note_text = "\n".join(p for p in [note_title.strip(), note_content.strip()] if p)

    try:
        response = await openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an AI note-taking agent. The user linked a GitHub issue "
                        "while writing notes. Read their note and propose ONE action that "
                        "requires their approval before execution.\n\n"
                        "Return JSON:\n"
                        "{\n"
                        '  "title": "short action title",\n'
                        '  "summary": "1-2 sentences explaining what Blaze inferred",\n'
                        '  "steps": ["2-4 bullets for the user"],\n'
                        '  "suggestedAction": "follow_up_comment" | "mark_done" | "handoff_coding",\n'
                        '  "draftFollowUp": "GitHub comment draft if follow_up_comment, else empty",\n'
                        '  "confidence": 0.0-1.0\n'
                        "}\n"
                        "Infer intent from the note — e.g. 'I'll reply with a fix' → "
                        "follow_up_comment, 'this is done' → mark_done, technical work or "
                        "investigation → handoff_coding."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Issue: {repo}#{issue_number}\n"
                        f"Title: {issue_title}\n"
                        f"Context: {issue_summary or 'No summary'}\n\n"
                        f"User note:\n{note_text}"
                    ),
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("No extraction")

        parsed = json.loads(content)
        suggested = parsed.get("suggestedAction", "handoff_coding")
        if suggested not in ("follow_up_comment", "mark_done", "watch", "handoff_coding"):
            suggested = "handoff_coding"

        return Intent(
            type="github_next_steps",
            title=parsed.get("title") or f"Action on {repo}#{issue_number}",
            summary=parsed.get("summary") or "",
            steps=parsed.get("steps") or [],
            suggestedAction=suggested,
            draftFollowUp=parsed.get("draftFollowUp") or "",
            repo=repo,
            issueNumber=issue_number,
            risk="high",
            confidence=float(parsed.get("confidence", 0.8)),
            sourceMessageIds=[],
        )
    except Exception:
        return _default_note_plan(
            note_title, note_content, repo, issue_number, issue_title
        )


async def _find_pending_action(
    session_id: str,
    repo: str,
    issue_number: int,
) -> AgentAction | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction).where(
                AgentAction.sessionId == session_id,
                AgentAction.intentType == IntentType.GITHUB_NEXT_STEPS,
                AgentAction.status == AgentActionStatus.PENDING,
            )
        )
        for action in result.scalars().all():
            payload = action.payload or {}
            if (
                payload.get("repo") == repo
                and payload.get("issueNumber") == issue_number
            ):
                return action
    return None


async def analyze_note_for_priority(
    user_id: str,
    session_id: str,
    priority_item_id: str,
    note_title: str,
    note_content: str,
) -> dict:
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.id == session_id,
                CaptureSession.userId == user_id,
            )
        )
        session = session_result.scalar_one_or_none()
        if not session:
            return {"error": "Session not found", "actions": []}

        item_result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.id == priority_item_id,
                PriorityItem.userId == user_id,
            )
        )
        item = item_result.scalar_one_or_none()
        if not item:
            return {"error": "Priority item not found", "actions": []}

    parsed = _parse_external_id(item.externalId)
    if not parsed:
        return {"error": "Invalid issue reference", "actions": []}

    repo, issue_number = parsed

    await link_priority_to_session(user_id, session_id, priority_item_id)

    plan = await extract_note_issue_plan(
        note_title=note_title,
        note_content=note_content,
        repo=repo,
        issue_number=issue_number,
        issue_title=item.title,
        issue_summary=item.aiSummary,
    )

    existing = await _find_pending_action(session_id, repo, issue_number)
    if existing:
        async with AsyncSessionLocal() as db:
            existing_row = await db.get(AgentAction, existing.id)
            if existing_row:
                existing_row.payload = plan.model_dump()
                existing_row.confidence = plan.confidence
                await db.commit()
                return {
                    "actions": [serialize_model(existing_row)],
                    "updated": True,
                }

    action_id = generate_id()
    async with AsyncSessionLocal() as db:
        action = AgentAction(
            id=action_id,
            sessionId=session_id,
            intentType=IntentType.GITHUB_NEXT_STEPS,
            riskLevel=RiskLevel.HIGH,
            confidence=plan.confidence,
            payload=plan.model_dump(),
            sourceMessageIds=[],
            status=AgentActionStatus.PENDING,
        )
        db.add(action)
        await db.commit()
        await db.refresh(action)
        return {"actions": [serialize_model(action)], "created": True}
