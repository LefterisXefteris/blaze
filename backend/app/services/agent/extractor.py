import json
import re
from datetime import datetime, timedelta, timezone

from openai import AsyncOpenAI

from app.config import get_settings
from app.types import ExtractionResult, Intent, SessionMessage

settings = get_settings()
_openai: AsyncOpenAI | None = (
    AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
)

DAY_NAMES = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
]


def _next_day_of_week(reference: datetime, target_dow: int) -> datetime:
    """target_dow: 0=Sunday (date-fns convention)."""
    python_dow = (target_dow + 6) % 7
    current = reference.weekday()
    days_ahead = python_dow - current
    if days_ahead <= 0:
        days_ahead += 7
    return reference + timedelta(days=days_ahead)


def parse_relative_date(text: str, reference: datetime) -> str | None:
    lower = text.lower()
    target = reference.replace(hour=0, minute=0, second=0, microsecond=0)

    for i, day_name in enumerate(DAY_NAMES):
        if day_name in lower:
            target = _next_day_of_week(reference, i)
            break

    if "tomorrow" in lower:
        target = reference + timedelta(days=1)

    time_match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", lower)
    if time_match:
        hours = int(time_match.group(1))
        minutes = int(time_match.group(2) or 0)
        meridiem = time_match.group(3)

        if meridiem == "pm" and hours < 12:
            hours += 12
        if meridiem == "am" and hours == 12:
            hours = 0
        if not meridiem and hours <= 7:
            hours += 12

        target = target.replace(hour=hours, minute=minutes, second=0, microsecond=0)
    else:
        target = target.replace(hour=15, minute=0, second=0, microsecond=0)

    return target.isoformat()


def rule_based_extract(messages: list[SessionMessage], reference: datetime) -> ExtractionResult:
    intents: list[Intent] = []
    seen: set[str] = set()

    for msg in messages:
        text = msg.content
        lower = text.lower()

        calendar_patterns = [
            r"(?:let'?s|can we|schedule|meet|sync|call|chat)\s+(?:on\s+)?(.{0,80})",
            r"(?:tuesday|wednesday|thursday|friday|monday|tomorrow).{0,40}(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)",
        ]

        if (
            any(re.search(p, text, re.IGNORECASE) for p in calendar_patterns)
            and any(
                kw in lower
                for kw in ("meet", "sync", "call", "schedule", "calendar")
            )
        ):
            key = f"cal:{text[:40]}"
            if key not in seen:
                seen.add(key)
                start = parse_relative_date(text, reference)
                end = None
                if start:
                    end_dt = datetime.fromisoformat(start) + timedelta(hours=1)
                    end = end_dt.isoformat()
                intents.append(
                    Intent(
                        type="calendar_event",
                        confidence=0.75,
                        title="Sync meeting" if "sync" in text else "Meeting",
                        description=text,
                        start=start,
                        end=end,
                        attendees=[],
                        sourceMessageIds=[msg.id],
                        risk="low",
                    )
                )

        todo_patterns = [
            r"i(?:'ll|\s+will)\s+(.{5,120})",
            r"(?:action item|todo|task):\s*(.{3,120})",
            r"(?:send|share|prepare|finish|complete)\s+(?:the\s+)?(.{5,80})",
        ]

        for pattern in todo_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                title = match.group(1).strip().rstrip(".!?")
                key = f"todo:{title[:40]}"
                if key not in seen and len(title) > 4:
                    seen.add(key)
                    intents.append(
                        Intent(
                            type="todo",
                            confidence=0.7,
                            title=title[0].upper() + title[1:],
                            sourceMessageIds=[msg.id],
                            risk="low",
                        )
                    )

        if (
            ("draft" in lower or "send" in lower)
            and any(kw in lower for kw in ("email", "recap", "follow"))
        ):
            key = f"email:{text[:40]}"
            if key not in seen:
                seen.add(key)
                intents.append(
                    Intent(
                        type="follow_up_email",
                        confidence=0.8,
                        title="Follow-up email",
                        description=text,
                        sourceMessageIds=[msg.id],
                        risk="high",
                    )
                )

        if any(
            kw in lower
            for kw in ("bug", "ticket", "file an issue", "linear", "jira")
        ):
            key = f"ticket:{text[:40]}"
            if key not in seen:
                seen.add(key)
                intents.append(
                    Intent(
                        type="ticket",
                        confidence=0.75,
                        title="Issue from conversation",
                        description=text,
                        sourceMessageIds=[msg.id],
                        risk="high",
                    )
                )

    return ExtractionResult(intents=intents)


def rule_based_live_summary(
    messages: list[SessionMessage],
    user_notes: str,
    title: str | None = None,
) -> str:
    if not messages:
        return user_notes.strip() or "Waiting for conversation to start…"

    recent = messages[-8:]
    speakers = list(dict.fromkeys(m.speaker for m in recent))
    lines = [
        f"**{title}**" if title else "**Meeting in progress**",
        "",
        f"Participants: {', '.join(speakers)}",
        "",
        "**Recent discussion**",
    ]
    for m in recent:
        content = m.content[:120] + ("…" if len(m.content) > 120 else "")
        lines.append(f"• {m.speaker}: {content}")

    if user_notes.strip():
        lines.extend(["", "**Your notes**", user_notes.strip()])

    return "\n".join(lines)


async def generate_live_summary(
    messages: list[SessionMessage],
    user_notes: str,
    session_meta: dict[str, str | None],
    related_context: str | None = None,
) -> str:
    if not messages:
        return user_notes.strip() or "Waiting for conversation to start…"

    window = messages[-30:]
    source_type = session_meta.get("sourceType")
    source_label = "Slack meeting/huddle" if source_type == "SLACK" else "Meeting"
    title = session_meta.get("title")

    if not _openai:
        return rule_based_live_summary(window, user_notes, title)

    transcript = "\n".join(f"{m.speaker}: {m.content}" for m in window)
    context_block = ""
    if related_context and related_context.strip():
        context_block = (
            "\n\nRelated workspace context (use only if relevant to the discussion "
            "— do not invent details):\n"
            + related_context.strip()
        )

    related_ctx_line = ""
    if related_context and related_context.strip():
        related_ctx_line = (
            "- **Related PR/issue context** (brief, if workspace context is relevant to this meeting)"
        )

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""You write live meeting notes like Granola — concise, scannable markdown.
Format:
- One-line meeting context
- **Key points** (3-6 bullets, only what's substantively discussed)
- **Decisions** (if any, else omit section)
- **Action items** (if any, with owner when clear)
- **Open questions** (if any)
{related_ctx_line}

Keep it short. Update-style notes for someone glancing during a live {source_label}.
Do not invent facts. Use only the transcript and provided workspace context.""",
                },
                {
                    "role": "user",
                    "content": (
                        f"Meeting: {title or 'Untitled'}\n"
                        f"User scratch notes:\n{user_notes or '(none)'}\n\n"
                        f"Transcript:\n{transcript}{context_block}"
                    ),
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return content.strip() if content else rule_based_live_summary(window, user_notes, title)
    except Exception:
        return rule_based_live_summary(window, user_notes, title)


async def extract_intents(
    messages: list[SessionMessage],
    session_meta: dict[str, str | None],
) -> ExtractionResult:
    if not messages:
        return ExtractionResult(intents=[])

    reference = datetime.now(timezone.utc)
    window = messages[-20:]

    if not _openai:
        return rule_based_extract(window, reference)

    transcript = "\n".join(f"[{m.id}] {m.speaker}: {m.content}" for m in window)

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract actionable intents from conversation transcripts.\n"
                        "Return JSON: { \"intents\": [...] }\n"
                        "Each intent: type (calendar_event|todo|follow_up_email|ticket|crm_update), "
                        "confidence (0-1), title, optional description/start/end/dueDate/attendees/assignee, "
                        "sourceMessageIds (array of message ids from transcript), "
                        "risk (low for calendar_event and todo, high for others).\n"
                        f"Session: {session_meta.get('title') or 'Untitled'}. "
                        f"Today: {reference.isoformat()}.\n"
                        "Only extract clear, actionable intents. Never auto high-risk without explicit request."
                    ),
                },
                {"role": "user", "content": transcript},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content
        if not content:
            return rule_based_extract(window, reference)

        parsed = ExtractionResult.model_validate(json.loads(content))
        return parsed
    except Exception:
        return rule_based_extract(window, reference)


async def generate_note(
    messages: list[SessionMessage],
    user_notes: str,
    actions: list[dict[str, str]],
) -> dict:
    fallback = {
        "aiSummary": (
            f"Conversation with {', '.join(dict.fromkeys(m.speaker for m in messages))} "
            f"covering {len(messages)} messages."
            + (f" User notes: {user_notes}" if user_notes else "")
        ),
        "structured": {
            "summary": f"Discussion captured from {len(messages)} messages.",
            "decisions": [],
            "actionItems": [
                {"text": a["title"]}
                for a in actions
                if a.get("status") not in ("REJECTED", "UNDONE")
            ],
            "openQuestions": [],
            "keyQuotes": [
                {"speaker": m.speaker, "text": m.content} for m in messages[-3:]
            ],
        },
    }

    if not _openai:
        return fallback

    transcript = "\n".join(f"{m.speaker}: {m.content}" for m in messages)

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate meeting/conversation notes as JSON with: summary, decisions (array), "
                        "actionItems (array of {text, assignee?, dueDate?}), openQuestions (array), "
                        "keyQuotes (array of {speaker, text}).\n"
                        f"Include agent actions taken: {json.dumps(actions)}"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User scratch notes:\n{user_notes or '(none)'}\n\n"
                        f"Transcript:\n{transcript}"
                    ),
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        if not content:
            return fallback

        parsed = json.loads(content)
        return {
            "aiSummary": parsed.get("summary") or "Session summary",
            "structured": parsed,
        }
    except Exception:
        return fallback


async def run_recipe(
    prompt: str,
    messages: list[SessionMessage],
    user_notes: str,
) -> str:
    transcript = "\n".join(f"{m.speaker}: {m.content}" for m in messages)

    if not _openai:
        return (
            f"[Recipe output — set OPENAI_API_KEY for AI generation]\n\n"
            f"Prompt: {prompt}\n\nContext: {transcript[:500]}..."
        )

    response = await _openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": f"User notes:\n{user_notes}\n\nTranscript:\n{transcript}",
            },
        ],
        temperature=0.5,
    )
    content = response.choices[0].message.content
    return content or "No output generated."
