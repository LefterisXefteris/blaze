#!/usr/bin/env python3
"""Seed Blaze prompt templates in Langfuse (production label)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.llm.prompts import (  # noqa: E402
    INTENT_EXTRACTION_PROMPT_NAME,
    LANGFUSE_INTENT_EXTRACTION_TEMPLATE,
    LANGFUSE_LIVE_SUMMARY_TEMPLATE,
    LIVE_SUMMARY_PROMPT_NAME,
)
from app.services.llm.observability import langfuse_enabled, get_langfuse_client  # noqa: E402


PROMPTS = [
    {
        "name": INTENT_EXTRACTION_PROMPT_NAME,
        "prompt": LANGFUSE_INTENT_EXTRACTION_TEMPLATE,
        "labels": ["production", "intent-v1"],
        "config": {"model": "gpt-4o-mini", "temperature": 0.2},
    },
    {
        "name": LIVE_SUMMARY_PROMPT_NAME,
        "prompt": LANGFUSE_LIVE_SUMMARY_TEMPLATE,
        "labels": ["production", "live-summary-v1"],
        "config": {"model": "gpt-4o-mini", "temperature": 0.3},
    },
]


def main() -> int:
    if not langfuse_enabled():
        print(
            "Langfuse is not enabled. Start the self-hosted stack "
            "(docker compose -f docker-compose.langfuse.yml up -d), then set "
            "LANGFUSE_ENABLED=true and local API keys in .env.",
            file=sys.stderr,
        )
        return 1

    client = get_langfuse_client()
    if not client:
        print("Could not initialize Langfuse client.", file=sys.stderr)
        return 1

    for item in PROMPTS:
        client.create_prompt(
            name=item["name"],
            type="text",
            prompt=item["prompt"],
            labels=item["labels"],
            config=item["config"],
        )
        print(f"Seeded prompt: {item['name']} ({', '.join(item['labels'])})")

    client.flush()
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
