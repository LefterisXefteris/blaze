"""Build coding-agent handoff context from Blaze actions and sessions."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import AgentAction, CaptureSession, PriorityItem
from app.services.integrations.github import (
    fetch_issue_comments,
    fetch_issue_or_pull,
    get_github_token,
)
from app.services.integrations.cursor_handoff import deliver_handoff_to_cursor, find_git_root
from app.services.vector.context import get_stored_related_context


def _handoff_dir() -> Path:
    settings = get_settings()
    raw = settings.blaze_handoff_dir
    if raw:
        path = Path(raw).expanduser()
    else:
        git_root = find_git_root()
        if git_root:
            path = git_root / ".blaze" / "handoffs"
        else:
            blaze_root = Path(__file__).resolve().parents[4]
            path = blaze_root / ".blaze" / "handoffs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len] or "task"


async def build_coding_handoff_markdown(action_id: str, user_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentAction)
            .join(CaptureSession, AgentAction.sessionId == CaptureSession.id)
            .options(
                selectinload(AgentAction.session).selectinload(CaptureSession.messages),
            )
            .where(AgentAction.id == action_id, CaptureSession.userId == user_id)
        )
        action = result.scalar_one_or_none()

    if not action:
        return {"error": "Action not found"}

    payload = action.payload or {}
    session = action.session
    repo = payload.get("repo")
    issue_number = payload.get("issueNumber")
    external_id = f"{repo}#{issue_number}" if repo and issue_number else None

    priority_item: PriorityItem | None = None
    if external_id:
        async with AsyncSessionLocal() as db:
            pri_result = await db.execute(
                select(PriorityItem).where(
                    PriorityItem.userId == user_id,
                    PriorityItem.externalId == external_id,
                )
            )
            priority_item = pri_result.scalar_one_or_none()

    issue_body = ""
    issue_title = payload.get("title") or (priority_item.title if priority_item else "")
    issue_url = priority_item.externalUrl if priority_item else None
    comments_block = ""

    if repo and issue_number:
        token = await get_github_token(user_id)
        if token:
            try:
                issue = await fetch_issue_or_pull(token, repo, issue_number)
                issue_title = issue.get("title") or issue_title
                issue_body = issue.get("body") or ""
                issue_url = issue.get("html_url") or issue_url
                comments = await fetch_issue_comments(token, repo, issue_number)
                if comments:
                    lines = []
                    for c in comments[-8:]:
                        user = (c.get("user") or {}).get("login", "unknown")
                        body = (c.get("body") or "").strip()
                        if body:
                            lines.append(f"- **{user}**: {body[:500]}")
                    if lines:
                        comments_block = "\n".join(lines)
            except Exception:
                pass

    related = get_stored_related_context(session.metadata_ or {})
    related_block = ""
    if related and related.promptText:
        related_block = related.promptText

    notes = (session.userNotes or "").strip()
    messages = session.messages or []
    transcript = "\n".join(
        f"{m.speaker}: {m.content}" for m in messages[-15:]
    ).strip()

    suggested = payload.get("suggestedAction") or "handoff_coding"
    summary = payload.get("summary") or ""
    draft = payload.get("draftFollowUp") or ""

    lines = [
        f"# Coding handoff: {external_id or issue_title or action_id}",
        "",
        "## Goal",
        summary or f"Work on {issue_title or 'the linked issue'} based on Blaze notes and context.",
        "",
    ]

    if external_id:
        lines.extend([
            "## GitHub issue",
            f"- **Ref**: `{external_id}`",
            f"- **Title**: {issue_title}",
        ])
        if issue_url:
            lines.append(f"- **URL**: {issue_url}")
        if priority_item and priority_item.aiSummary:
            lines.append(f"- **Blaze summary**: {priority_item.aiSummary}")
        lines.append("")

    if issue_body:
        lines.extend(["## Issue description", issue_body.strip(), ""])

    if notes:
        lines.extend(["## Your notes", notes, ""])

    if transcript:
        lines.extend(["## Session transcript (recent)", transcript, ""])

    if related_block:
        lines.extend(["## Related workspace context", related_block, ""])

    if comments_block:
        lines.extend(["## Recent GitHub comments", comments_block, ""])

    if draft:
        lines.extend(["## Suggested follow-up (if posting to GitHub)", draft, ""])

    lines.extend([
        "## Instructions for the coding agent",
        "1. Read the issue, notes, and transcript above.",
        "2. Implement, investigate, or fix as appropriate — do not only triage in Blaze.",
        "3. Run relevant tests if a repo is checked out locally.",
        "4. Summarize what you changed and whether a GitHub comment or PR is needed.",
        "",
        f"**Blaze action ID**: `{action_id}`",
        f"**Suggested Blaze action**: `{suggested}`",
        f"**Generated**: {datetime.now(timezone.utc).isoformat()}",
    ])

    markdown = "\n".join(lines)
    return {
        "actionId": action_id,
        "sessionId": session.id,
        "repo": repo,
        "issueNumber": issue_number,
        "externalId": external_id,
        "issueUrl": issue_url,
        "suggestedAction": suggested,
        "markdown": markdown,
    }


async def write_coding_handoff_file(action_id: str, user_id: str) -> dict[str, Any]:
    handoff = await build_coding_handoff_markdown(action_id, user_id)
    if handoff.get("error"):
        return handoff

    external = handoff.get("externalId") or handoff.get("actionId") or action_id
    slug = _slugify(str(external))
    filename = f"{slug}-{action_id[:8]}.md"
    path = _handoff_dir() / filename
    path.write_text(handoff["markdown"], encoding="utf-8")

    handoff["path"] = str(path.resolve())
    handoff["filename"] = filename
    handoff["cursorDelivery"] = deliver_handoff_to_cursor(path)
    return handoff
