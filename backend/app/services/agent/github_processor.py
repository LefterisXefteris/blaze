import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import (
    AgentAction,
    AgentActionStatus,
    CaptureSession,
    CaptureSessionStatus,
    CaptureSourceType,
    IntentType,
    Message,
    PriorityItem,
    RiskLevel,
)
from app.queue import enqueue_intent_extraction
from app.services.agent.action_executor import execute_github_ack_comment
from app.services.agent.github_extractor import (
    extract_github_intents,
    extract_github_mention_plan,
    summarize_github_thread,
)
from app.services.integrations.github import (
    external_id_for_issue,
    fetch_issue_comments,
    fetch_issue_or_pull,
    find_user_by_github_login,
    get_github_metadata,
    get_github_token,
    github_fetch,
)
from app.services.vector.indexer import index_github_session


def new_id() -> str:
    return secrets.token_hex(12)


def _get_repo_full_name(payload: dict[str, Any]) -> str:
    repo = payload.get("repository")
    if isinstance(repo, dict):
        return repo.get("full_name") or "unknown/unknown"
    return "unknown/unknown"


async def _should_process(
    user_id: str,
    reason: str,
) -> bool:
    settings = await get_github_metadata(user_id)
    if reason == "assigned":
        return settings.get("autoAssign", True) is not False
    if reason == "mentioned":
        return settings.get("autoMention", True) is not False
    if reason == "review_requested":
        return settings.get("autoReview", True) is not False
    return True


async def _process_mention_actions(
    session_id: str,
    user_id: str,
    repo: str,
    number: int,
    title: str,
    messages: list,
) -> None:
    settings = await get_github_metadata(user_id)
    from app.types import SessionMessage

    session_messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in messages
    ]

    plan = await extract_github_mention_plan(repo, number, title, session_messages)
    ack_comment = plan["ackComment"]
    next_steps = plan["nextSteps"]

    async with AsyncSessionLocal() as db:
        ack_result = await db.execute(
            select(AgentAction).where(
                AgentAction.sessionId == session_id,
                AgentAction.intentType == IntentType.GITHUB_ACK_COMMENT,
                AgentAction.status.in_(
                    [
                        AgentActionStatus.PENDING,
                        AgentActionStatus.AUTO_EXECUTED,
                        AgentActionStatus.CONFIRMED,
                    ]
                ),
            )
        )
        existing_ack = ack_result.scalar_one_or_none()

    if not existing_ack and settings.get("autoAckMention", True) is not False:
        ack_payload = {
            "type": "github_ack_comment",
            "title": f"Ack on {repo}#{number}",
            "body": ack_comment,
            "repo": repo,
            "issueNumber": number,
            "risk": "low",
            "confidence": 0.9,
            "sourceMessageIds": next_steps.sourceMessageIds,
        }

        async with AsyncSessionLocal() as db:
            ack_action = AgentAction(
                id=new_id(),
                sessionId=session_id,
                intentType=IntentType.GITHUB_ACK_COMMENT,
                riskLevel=RiskLevel.LOW,
                confidence=0.9,
                payload=ack_payload,
                sourceMessageIds=next_steps.sourceMessageIds,
                status=AgentActionStatus.PENDING,
            )
            db.add(ack_action)
            await db.commit()
            ack_action_id = ack_action.id

        await execute_github_ack_comment(ack_action_id, user_id)

    async with AsyncSessionLocal() as db:
        next_result = await db.execute(
            select(AgentAction).where(
                AgentAction.sessionId == session_id,
                AgentAction.intentType == IntentType.GITHUB_NEXT_STEPS,
                AgentAction.status.in_(
                    [AgentActionStatus.PENDING, AgentActionStatus.CONFIRMED]
                ),
            )
        )
        existing_next = next_result.scalar_one_or_none()

        if not existing_next:
            db.add(
                AgentAction(
                    id=new_id(),
                    sessionId=session_id,
                    intentType=IntentType.GITHUB_NEXT_STEPS,
                    riskLevel=RiskLevel.HIGH,
                    confidence=next_steps.confidence,
                    payload=next_steps.model_dump(),
                    sourceMessageIds=next_steps.sourceMessageIds,
                    status=AgentActionStatus.PENDING,
                )
            )
            await db.commit()


async def _process_legacy_github_intents(
    session_id: str,
    repo: str,
    number: int,
    title: str,
    messages: list,
) -> None:
    from app.types import SessionMessage

    session_messages = [
        SessionMessage(
            id=m.id,
            speaker=m.speaker,
            content=m.content,
            sentAt=m.sentAt,
        )
        for m in messages
    ]

    extraction = await extract_github_intents(repo, number, title, session_messages)

    for intent in extraction.intents:
        if intent.type == "github_comment":
            intent_type = IntentType.GITHUB_COMMENT
        elif intent.type == "github_label":
            intent_type = IntentType.GITHUB_LABEL
        else:
            intent_type = IntentType.GITHUB_PRIORITY

        async with AsyncSessionLocal() as db:
            existing_result = await db.execute(
                select(AgentAction).where(
                    AgentAction.sessionId == session_id,
                    AgentAction.intentType == intent_type,
                    AgentAction.status.in_(
                        [
                            AgentActionStatus.PENDING,
                            AgentActionStatus.AUTO_EXECUTED,
                            AgentActionStatus.CONFIRMED,
                        ]
                    ),
                )
            )
            if existing_result.scalar_one_or_none():
                continue

            db.add(
                AgentAction(
                    id=new_id(),
                    sessionId=session_id,
                    intentType=intent_type,
                    riskLevel=RiskLevel.LOW if intent.risk == "low" else RiskLevel.HIGH,
                    confidence=intent.confidence,
                    payload=intent.model_dump(),
                    sourceMessageIds=intent.sourceMessageIds,
                    status=(
                        AgentActionStatus.PENDING
                        if intent.risk == "high"
                        else AgentActionStatus.AUTO_EXECUTED
                    ),
                )
            )
            await db.commit()


async def ingest_github_item(
    user_id: str,
    repo: str,
    number: int,
    reason: str,
    item_override: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if reason != "manual" and not await _should_process(user_id, reason):
        return None

    token = await get_github_token(user_id)
    if not token:
        raise RuntimeError("GitHub not connected")

    if item_override:
        issue = {
            "number": number,
            "title": item_override["title"],
            "body": item_override.get("body"),
            "html_url": item_override["url"],
            "user": {"login": item_override.get("author")} if item_override.get("author") else None,
            "labels": [{"name": n} for n in item_override.get("labels") or []],
            "assignees": [{"login": l} for l in item_override.get("assignees") or []],
            "pull_request": (
                {"url": "pull"}
                if item_override.get("itemType") == "pull_request"
                else None
            ),
        }
        comments: list[dict[str, Any]] = []
    else:
        issue = await fetch_issue_or_pull(token, repo, number)
        comments = await fetch_issue_comments(token, repo, number)

    item_type = "pull_request" if issue.get("pull_request") else "issue"
    external_id = external_id_for_issue(repo, number)

    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(
                CaptureSession.userId == user_id,
                CaptureSession.sourceType == CaptureSourceType.GITHUB,
                CaptureSession.sourceRef == external_id,
                CaptureSession.status == CaptureSessionStatus.ACTIVE,
            )
        )
        session = session_result.scalar_one_or_none()

        if not session:
            session = CaptureSession(
                id=new_id(),
                userId=user_id,
                title=f"{repo} #{number}: {issue['title']}",
                sourceType=CaptureSourceType.GITHUB,
                sourceRef=external_id,
            )
            db.add(session)
            await db.flush()

            db.add(
                Message(
                    id=new_id(),
                    sessionId=session.id,
                    externalId=f"issue-{number}",
                    speaker=(issue.get("user") or {}).get("login") or "Author",
                    content=issue.get("body") or issue["title"],
                    sentAt=datetime.now(timezone.utc),
                )
            )

            for comment in comments:
                db.add(
                    Message(
                        id=new_id(),
                        sessionId=session.id,
                        externalId=f"comment-{comment['id']}",
                        speaker=(comment.get("user") or {}).get("login") or "Commenter",
                        content=comment["body"],
                        sentAt=datetime.fromisoformat(
                            comment["created_at"].replace("Z", "+00:00")
                        ),
                    )
                )
            await db.commit()
            session_id = session.id
        else:
            session_id = session.id

    async with AsyncSessionLocal() as db:
        msg_result = await db.execute(
            select(Message).where(Message.sessionId == session_id).order_by(Message.sentAt)
        )
        messages = msg_result.scalars().all()

    summary = await summarize_github_thread(
        issue["title"],
        repo,
        reason,
        [{"speaker": m.speaker, "content": m.content} for m in messages],
    )

    priority_score = summary.get("priority") or (
        1 if reason == "review_requested" else 2
    )

    metadata = {
        "labels": [l["name"] for l in issue.get("labels") or []],
        "assignees": [a["login"] for a in issue.get("assignees") or []],
    }

    async with AsyncSessionLocal() as db:
        pri_result = await db.execute(
            select(PriorityItem).where(
                PriorityItem.userId == user_id,
                PriorityItem.source == "github",
                PriorityItem.externalId == external_id,
            )
        )
        priority_item = pri_result.scalar_one_or_none()

        if priority_item:
            priority_item.title = issue["title"]
            priority_item.reason = reason
            priority_item.priority = priority_score
            priority_item.aiSummary = summary["summary"]
            priority_item.sessionId = session_id
            priority_item.status = "open"
            priority_item.metadata_ = metadata
        else:
            priority_item = PriorityItem(
                id=new_id(),
                userId=user_id,
                source="github",
                externalId=external_id,
                externalUrl=issue["html_url"],
                itemType=item_type,
                title=issue["title"],
                repo=repo,
                reason=reason,
                priority=priority_score,
                aiSummary=summary["summary"],
                sessionId=session_id,
                metadata_=metadata,
            )
            db.add(priority_item)

        await db.commit()
        await db.refresh(priority_item)

    if reason == "mentioned":
        await _process_mention_actions(
            session_id, user_id, repo, number, issue["title"], messages
        )
    else:
        await _process_legacy_github_intents(
            session_id, repo, number, issue["title"], messages
        )

    await enqueue_intent_extraction(session_id)

    try:
        await index_github_session(
            user_id=user_id,
            session_id=session_id,
            source_ref=external_id,
            repo=repo,
            number=number,
            title=issue["title"],
            item_type=item_type,
            ai_summary=summary["summary"],
            body=issue.get("body"),
            priority_item_id=priority_item.id,
        )
    except Exception as error:
        print(f"GitHub index failed for {external_id}: {error}")

    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(CaptureSession).where(CaptureSession.id == session_id)
        )
        session = session_result.scalar_one()

    return {"session": session, "priorityItem": priority_item}


async def process_github_event(event: str, payload: dict[str, Any]) -> None:
    repo = _get_repo_full_name(payload)
    issue = payload.get("issue")
    pull_request = payload.get("pull_request")
    target = issue or pull_request

    if not target:
        return

    assignee = payload.get("assignee")
    comment = payload.get("comment")
    requested_reviewer = payload.get("requested_reviewer")

    candidates: list[dict[str, str]] = []

    if event == "issues" and payload.get("action") == "assigned":
        login = assignee.get("login") if isinstance(assignee, dict) else None
        if login:
            candidates.append({"login": login, "reason": "assigned"})

    if event == "pull_request" and payload.get("action") == "assigned":
        login = assignee.get("login") if isinstance(assignee, dict) else None
        if login:
            candidates.append({"login": login, "reason": "assigned"})

    if event == "pull_request" and payload.get("action") == "review_requested":
        login = (
            requested_reviewer.get("login")
            if isinstance(requested_reviewer, dict)
            else None
        )
        if login:
            candidates.append({"login": login, "reason": "review_requested"})

    if event == "issue_comment" and payload.get("action") == "created":
        body = comment.get("body") if isinstance(comment, dict) else None
        if body:
            for m in re.findall(r"@([a-zA-Z0-9-]+)", body):
                candidates.append({"login": m, "reason": "mentioned"})

    if (
        event in ("issues", "pull_request")
        and payload.get("action") == "opened"
        and target.get("body")
    ):
        for m in re.findall(r"@([a-zA-Z0-9-]+)", target["body"]):
            candidates.append({"login": m, "reason": "mentioned"})

    for candidate in candidates:
        user_id = await find_user_by_github_login(candidate["login"])
        if not user_id:
            continue

        item_type = (
            "pull_request"
            if target.get("pull_request") or event == "pull_request"
            else "issue"
        )

        await ingest_github_item(
            user_id=user_id,
            repo=repo,
            number=target["number"],
            reason=candidate["reason"],
            item_override={
                "title": target["title"],
                "itemType": item_type,
                "url": target["html_url"],
                "body": target.get("body"),
                "author": (target.get("user") or {}).get("login"),
            },
        )


async def import_github_url(user_id: str, url: str) -> dict[str, Any] | None:
    match = re.search(r"github\.com/([^/]+/[^/]+)/(issues|pull)/(\d+)", url)
    if not match:
        raise ValueError("Invalid GitHub issue or PR URL")

    repo, _, num_str = match.groups()
    number = int(num_str)

    return await ingest_github_item(
        user_id=user_id,
        repo=repo,
        number=number,
        reason="manual",
    )


async def sync_github_mentions(user_id: str) -> dict[str, Any]:
    token = await get_github_token(user_id)
    meta = await get_github_metadata(user_id)
    login = meta.get("githubLogin")

    if not token or not login:
        raise RuntimeError("GitHub not connected")

    if meta.get("autoMention") is False:
        return {"synced": 0, "skipped": True}

    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    q = f"mentions:{login} updated:>={since}"

    results = await github_fetch(
        token,
        f"/search/issues?q={quote(q)}&sort=updated&order=desc&per_page=30",
    )

    synced = 0
    for item in results.get("items") or []:
        repo_match = re.search(r"repos/([^/]+/[^/]+)$", item.get("repository_url") or "")
        repo = repo_match.group(1) if repo_match else None
        if not repo:
            continue

        await ingest_github_item(
            user_id=user_id,
            repo=repo,
            number=item["number"],
            reason="mentioned",
            item_override={
                "title": item["title"],
                "itemType": "pull_request" if item.get("pull_request") else "issue",
                "url": item["html_url"],
                "body": item.get("body"),
                "author": (item.get("user") or {}).get("login"),
            },
        )
        synced += 1

    return {"synced": synced, "total": len(results.get("items") or [])}
