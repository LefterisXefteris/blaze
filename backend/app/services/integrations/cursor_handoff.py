"""Open Blaze handoffs in Cursor and drop a rules snippet for the active task."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.config import get_settings


def find_git_root(start: Path | None = None) -> Path | None:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / ".git").exists():
            return candidate
    return None


def _handoff_path_label(handoff_path: Path, repo_root: Path | None) -> str:
    resolved = handoff_path.resolve()
    if repo_root:
        try:
            return str(resolved.relative_to(repo_root.resolve()))
        except ValueError:
            pass
    return str(resolved)


def write_cursor_rules_snippet(handoff_path: Path, repo_root: Path | None) -> dict[str, Any]:
    settings = get_settings()
    if not settings.blaze_cursor_rules or repo_root is None:
        return {"written": False}

    rules_dir = repo_root / ".cursor" / "rules"
    rules_dir.mkdir(parents=True, exist_ok=True)
    rules_file = rules_dir / "blaze-handoff.mdc"
    label = _handoff_path_label(handoff_path, repo_root)

    rules_file.write_text(
        "\n".join(
            [
                "---",
                "description: Active Blaze coding handoff — implement this task",
                "alwaysApply: true",
                "---",
                "",
                "# Blaze handoff",
                "",
                "Implement the coding task described in:",
                "",
                f"`{label}`",
                "",
                "Read that file fully (issue context, notes, transcript) before making changes.",
                "When done, summarize what you changed and whether a GitHub comment or PR is needed.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return {"written": True, "path": str(rules_file.resolve())}


def open_handoff_in_cursor(handoff_path: Path) -> dict[str, Any]:
    settings = get_settings()
    mode = (settings.blaze_cursor_handoff or "auto").lower()
    if mode == "off":
        return {"opened": False, "skipped": True, "reason": "BLAZE_CURSOR_HANDOFF=off"}

    resolved = handoff_path.resolve()
    errors: list[str] = []
    cursor_bin = shutil.which("cursor")

    if cursor_bin and mode in ("auto", "add"):
        try:
            subprocess.run(
                [cursor_bin, "--add", str(resolved)],
                check=True,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return {"opened": True, "method": "cursor --add", "path": str(resolved)}
        except Exception as error:
            errors.append(f"cursor --add: {error}")

    if sys.platform == "darwin" and mode in ("auto", "open"):
        try:
            subprocess.run(
                ["open", "-a", "Cursor", str(resolved)],
                check=True,
                capture_output=True,
                text=True,
                timeout=15,
            )
            return {"opened": True, "method": "open -a Cursor", "path": str(resolved)}
        except Exception as error:
            errors.append(f"open -a Cursor: {error}")

    return {"opened": False, "path": str(resolved), "errors": errors}


def deliver_handoff_to_cursor(handoff_path: Path) -> dict[str, Any]:
    repo_root = find_git_root(handoff_path.parent)
    rules = write_cursor_rules_snippet(handoff_path, repo_root)
    opened = open_handoff_in_cursor(handoff_path)
    return {"rules": rules, "cursor": opened, "repoRoot": str(repo_root) if repo_root else None}
