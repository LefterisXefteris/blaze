import json
import re

from openai import AsyncOpenAI

from app.config import get_settings
from app.types import ExtractionResult, Intent, SessionMessage

settings = get_settings()
_openai: AsyncOpenAI | None = (
    AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
)


async def summarize_github_thread(
    title: str,
    repo: str,
    reason: str,
    messages: list[dict[str, str]],
) -> dict[str, object]:
    transcript = "\n".join(f"{m['speaker']}: {m['content']}" for m in messages)
    urgent_pattern = re.compile(r"urgent|production|blocked|critical|asap|p0|sev-?1", re.I)
    is_urgent = bool(urgent_pattern.search(title) or urgent_pattern.search(transcript))

    if not _openai:
        return {
            "summary": (
                f"{reason.replace('_', ' ')} on {repo}: {title}. "
                "Review the thread and respond."
            ),
            "priority": 1 if is_urgent else (1 if reason == "review_requested" else 2),
        }

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize GitHub issue/PR for triage. Return JSON: "
                        '{"summary": "2-3 sentences", "priority": 1|2|3} '
                        "where 1=urgent, 2=normal, 3=low."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Reason: {reason}\nRepo: {repo}\nTitle: {title}\n\n{transcript}",
                },
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("No summary")

        parsed = json.loads(content)
        return {
            "summary": parsed["summary"],
            "priority": parsed.get("priority", 2),
        }
    except Exception:
        return {
            "summary": f"{reason.replace('_', ' ')} on {repo}: {title}",
            "priority": 1 if is_urgent else 2,
        }


def _default_mention_plan(
    repo: str,
    issue_number: int,
    title: str,
    messages: list[SessionMessage],
) -> dict:
    return {
        "ackComment": (
            f'Thanks for looping me in on "{title}". '
            "I'll review this thread and follow up if I have anything useful to add."
        ),
        "nextSteps": Intent(
            type="github_next_steps",
            title=f"Next steps for {repo}#{issue_number}",
            summary=f'Review "{title}" and decide whether a deeper response is needed.',
            steps=[
                "Read the full issue/PR thread and any linked context",
                "Assess whether this needs your direct involvement",
                "Post a follow-up comment, watch, or mark done in Blaze",
            ],
            suggestedAction="watch",
            draftFollowUp="",
            repo=repo,
            issueNumber=issue_number,
            risk="high",
            confidence=0.7,
            sourceMessageIds=[messages[-1].id] if messages else [],
        ),
    }


async def extract_github_mention_plan(
    repo: str,
    issue_number: int,
    title: str,
    messages: list[SessionMessage],
) -> dict:
    if not _openai:
        return _default_mention_plan(repo, issue_number, title, messages)

    transcript = "\n".join(f"[{m.id}] {m.speaker}: {m.content}" for m in messages)

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You triage GitHub @mentions for a busy engineer. Return JSON:\n"
                        "{\n"
                        '  "ackComment": "2-3 sentence polite ack...",\n'
                        '  "nextSteps": {\n'
                        '    "title": "short title",\n'
                        '    "summary": "1-2 sentence triage summary",\n'
                        '    "steps": ["3-4 actionable bullets"],\n'
                        '    "suggestedAction": "follow_up_comment" | "mark_done" | "watch",\n'
                        '    "draftFollowUp": "optional longer comment"\n'
                        "  }\n"
                        "}\n"
                        "For large OSS repos default to watch/triage, not jumping in to fix."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Repo: {repo}\nIssue: #{issue_number}\nTitle: {title}\n\n{transcript}",
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("No extraction")

        parsed = json.loads(content)
        next_steps = parsed["nextSteps"]
        return {
            "ackComment": parsed["ackComment"].strip(),
            "nextSteps": Intent(
                type="github_next_steps",
                title=next_steps["title"],
                summary=next_steps["summary"],
                steps=next_steps["steps"],
                suggestedAction=next_steps.get("suggestedAction", "watch"),
                draftFollowUp=next_steps.get("draftFollowUp", ""),
                repo=repo,
                issueNumber=issue_number,
                risk="high",
                confidence=0.85,
                sourceMessageIds=[messages[-1].id] if messages else [],
            ),
        }
    except Exception:
        return _default_mention_plan(repo, issue_number, title, messages)


async def extract_github_intents(
    repo: str,
    issue_number: int,
    title: str,
    messages: list[SessionMessage],
) -> ExtractionResult:
    fallback = ExtractionResult(
        intents=[
            Intent(
                type="github_comment",
                confidence=0.7,
                title=f"Draft response on {repo}#{issue_number}",
                description=f'Thanks for the update on "{title}". I\'ll take a look and follow up shortly.',
                body=f'Thanks for the update on "{title}". I\'ll take a look and follow up shortly.',
                repo=repo,
                issueNumber=issue_number,
                sourceMessageIds=[messages[-1].id] if messages else [],
                risk="high",
            )
        ]
    )

    if not _openai:
        return fallback

    transcript = "\n".join(f"[{m.id}] {m.speaker}: {m.content}" for m in messages)

    try:
        response = await _openai.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract GitHub actions from issue thread. Return JSON { \"intents\": [...] }\n"
                        "Types: github_comment (high, include body draft), github_label (high, include labels array).\n"
                        f"Each intent needs: type, confidence, title, description, repo \"{repo}\", "
                        f"issueNumber {issue_number}, body or labels, sourceMessageIds, risk."
                    ),
                },
                {"role": "user", "content": f"Title: {title}\n\n{transcript}"},
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content
        if not content:
            raise ValueError("No extraction")

        parsed = ExtractionResult.model_validate(json.loads(content))
        return parsed
    except Exception:
        return ExtractionResult(
            intents=[
                Intent(
                    type="github_comment",
                    confidence=0.7,
                    title=f"Draft response on {repo}#{issue_number}",
                    body=f'Acknowledged — reviewing "{title}" now.',
                    repo=repo,
                    issueNumber=issue_number,
                    sourceMessageIds=[],
                    risk="high",
                )
            ]
        )
