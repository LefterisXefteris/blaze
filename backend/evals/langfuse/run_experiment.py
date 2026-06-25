#!/usr/bin/env python3
"""Run Blaze LLM eval cases against Langfuse dataset items (or local golden file)."""

from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.agent.extractor import extract_intents, generate_live_summary  # noqa: E402
from app.services.llm.observability import get_langfuse_client, langfuse_enabled  # noqa: E402
from app.types import SessionMessage  # noqa: E402

DATASET_PATH = Path(__file__).resolve().parent / "dataset.json"


def _parse_transcript(transcript: str) -> list[SessionMessage]:
    messages: list[SessionMessage] = []
    now = datetime.now(timezone.utc)
    for line in transcript.strip().splitlines():
        match = re.match(r"\[(?P<id>[^\]]+)\]\s*(?P<speaker>[^:]+):\s*(?P<content>.+)$", line)
        if not match:
            speaker, _, content = line.partition(":")
            messages.append(
                SessionMessage(
                    id=f"m{len(messages) + 1}",
                    speaker=speaker.strip() or "Speaker",
                    content=content.strip() or line.strip(),
                    sentAt=now,
                )
            )
            continue
        messages.append(
            SessionMessage(
                id=match.group("id"),
                speaker=match.group("speaker").strip(),
                content=match.group("content").strip(),
                sentAt=now,
            )
        )
    return messages


def _score_intent_item(result: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    intents = result.get("intents") or []
    types = [i.get("type") for i in intents]
    titles = " ".join(str(i.get("title", "")).lower() for i in intents)

    checks: dict[str, bool] = {}
    for intent_type in expected.get("intent_types", []):
        checks[f"has_{intent_type}"] = intent_type in types

    if "min_intents" in expected:
        checks["min_intents"] = len(intents) >= expected["min_intents"]
    if "max_intents" in expected:
        checks["max_intents"] = len(intents) <= expected["max_intents"]

    for fragment in expected.get("must_include_titles", []):
        checks[f"title_has_{fragment}"] = fragment.lower() in titles

    passed = all(checks.values()) if checks else True
    return {"passed": passed, "checks": checks, "intent_count": len(intents), "types": types}


def _score_summary_item(summary: str, expected: dict[str, Any]) -> dict[str, Any]:
    lower = summary.lower()
    checks: dict[str, bool] = {}
    for phrase in expected.get("must_include", []):
        checks[f"includes_{phrase}"] = phrase.lower() in lower
    for phrase in expected.get("must_not_include", []):
        checks[f"excludes_{phrase}"] = phrase.lower() not in lower
    passed = all(checks.values()) if checks else True
    return {"passed": passed, "checks": checks, "summary_preview": summary[:240]}


async def _run_item(item: dict[str, Any]) -> dict[str, Any]:
    task = item["task"]
    payload = item["input"]
    expected = item["expected_output"]

    if task == "intent_extraction":
        messages = _parse_transcript(payload["transcript"])
        extraction = await extract_intents(messages, {"title": payload.get("session_title")})
        result = {"intents": [i.model_dump() for i in extraction.intents]}
        score = _score_intent_item(result, expected)
    elif task == "live_summary":
        messages = _parse_transcript(payload["transcript"])
        summary = await generate_live_summary(
            messages,
            payload.get("user_notes", ""),
            {
                "title": payload.get("session_title"),
                "sourceType": payload.get("source_type", "MEETING"),
            },
        )
        result = {"summary": summary}
        score = _score_summary_item(summary, expected)
    else:
        raise ValueError(f"Unknown task: {task}")

    return {
        "id": item["id"],
        "task": task,
        "result": result,
        "score": score,
    }


async def _run_all(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    outputs = []
    for item in items:
        outputs.append(await _run_item(item))
    return outputs


def _upload_scores(client: Any, run_name: str, results: list[dict[str, Any]]) -> None:
    for entry in results:
        passed = 1.0 if entry["score"]["passed"] else 0.0
        client.create_score(
            name="golden_pass",
            value=passed,
            comment=json.dumps(entry["score"]["checks"]),
            metadata={
                "dataset_item_id": entry["id"],
                "task": entry["task"],
                "run_name": run_name,
            },
        )


async def main() -> int:
    dataset = json.loads(DATASET_PATH.read_text())
    items = dataset["items"]
    run_name = f"blaze-golden-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    print(f"Running {len(items)} eval cases ({run_name})...")
    results = await _run_all(items)

    passed = sum(1 for r in results if r["score"]["passed"])
    print(f"Passed {passed}/{len(results)}")

    for entry in results:
        status = "PASS" if entry["score"]["passed"] else "FAIL"
        print(f"  [{status}] {entry['id']} ({entry['task']})")

    if langfuse_enabled():
        client = get_langfuse_client()
        if client:
            _upload_scores(client, run_name, results)
            client.flush()
            print("Uploaded scores to Langfuse.")

    report_path = Path(__file__).resolve().parent / f"report-{run_name}.json"
    report_path.write_text(json.dumps({"run_name": run_name, "results": results}, indent=2))
    print(f"Wrote {report_path}")

    return 0 if passed == len(results) else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
