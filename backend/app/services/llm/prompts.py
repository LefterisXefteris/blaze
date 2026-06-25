"""Langfuse-managed prompts with local fallbacks for Blaze LLM tasks."""

from __future__ import annotations

from datetime import datetime

from app.services.llm.observability import get_langfuse_client, langfuse_enabled

INTENT_EXTRACTION_PROMPT_NAME = "blaze/intent-extraction"
LIVE_SUMMARY_PROMPT_NAME = "blaze/live-summary"

DEFAULT_INTENT_EXTRACTION_PROMPT = """You extract actionable intents from conversation transcripts.
Return JSON: { "intents": [...] }
Each intent: type (calendar_event|todo|follow_up_email|ticket|crm_update), \
confidence (0-1), title, optional description/start/end/dueDate/attendees/assignee, \
sourceMessageIds (array of message ids from transcript), \
risk (low for calendar_event and todo, high for others).
Session: {session_title}. Today: {reference_iso}.
Only extract clear, actionable intents. Never auto high-risk without explicit request."""

DEFAULT_LIVE_SUMMARY_PROMPT = """You write live meeting notes like Granola — concise, scannable markdown.
Format:
- One-line meeting context
- **Key points** (3-6 bullets, only what's substantively discussed)
- **Decisions** (if any, else omit section)
- **Action items** (if any, with owner when clear)
- **Open questions** (if any)
{related_ctx_line}

Keep it short. Update-style notes for someone glancing during a live {source_label}.
Do not invent facts. Use only the transcript and provided workspace context."""

# Langfuse prompt templates use {{var}} syntax; kept here for seeding.
LANGFUSE_INTENT_EXTRACTION_TEMPLATE = DEFAULT_INTENT_EXTRACTION_PROMPT.replace(
    "{session_title}", "{{session_title}}"
).replace("{reference_iso}", "{{reference_iso}}")

LANGFUSE_LIVE_SUMMARY_TEMPLATE = DEFAULT_LIVE_SUMMARY_PROMPT.replace(
    "{related_ctx_line}", "{{related_ctx_line}}"
).replace("{source_label}", "{{source_label}}")


def _compile_local(template: str, **variables: str) -> str:
    try:
        return template.format(**variables)
    except KeyError:
        return template


def get_intent_extraction_prompt(
    *,
    session_title: str | None,
    reference: datetime,
) -> str:
    variables = {
        "session_title": session_title or "Untitled",
        "reference_iso": reference.isoformat(),
    }

    if langfuse_enabled():
        client = get_langfuse_client()
        if client:
            try:
                prompt = client.get_prompt(INTENT_EXTRACTION_PROMPT_NAME, label="production")
                return str(prompt.compile(**variables))
            except Exception as error:
                print(f"Langfuse prompt fetch failed for {INTENT_EXTRACTION_PROMPT_NAME}: {error}")

    return _compile_local(DEFAULT_INTENT_EXTRACTION_PROMPT, **variables)


def get_live_summary_prompt(
    *,
    source_label: str,
    related_context_present: bool,
) -> str:
    related_ctx_line = ""
    if related_context_present:
        related_ctx_line = (
            "- **Related PR/issue context** (brief, if workspace context is relevant to this meeting)"
        )

    variables = {
        "source_label": source_label,
        "related_ctx_line": related_ctx_line,
    }

    if langfuse_enabled():
        client = get_langfuse_client()
        if client:
            try:
                prompt = client.get_prompt(LIVE_SUMMARY_PROMPT_NAME, label="production")
                return str(prompt.compile(**variables))
            except Exception as error:
                print(f"Langfuse prompt fetch failed for {LIVE_SUMMARY_PROMPT_NAME}: {error}")

    return _compile_local(DEFAULT_LIVE_SUMMARY_PROMPT, **variables)
