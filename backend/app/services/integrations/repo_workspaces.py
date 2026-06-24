"""Map GitHub repos to local checkout paths for coding handoffs."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

REPO_WORKSPACES_FILE = Path.home() / ".blaze" / "repos.json"
_REPO_SLUG = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _normalize_repo(repo: str) -> str:
    return repo.strip()


def _parse_env_map() -> dict[str, str]:
    raw = os.environ.get("BLAZE_REPO_MAP", "").strip()
    if not raw:
        return {}

    mapping: dict[str, str] = {}
    for entry in raw.split(","):
        piece = entry.strip()
        if not piece or "=" not in piece:
            continue
        repo, path = piece.split("=", 1)
        repo = _normalize_repo(repo)
        path = path.strip()
        if repo and path:
            mapping[repo] = path
    return mapping


def load_repo_workspaces() -> dict[str, str]:
    """Load repo → local path mappings from ~/.blaze/repos.json and BLAZE_REPO_MAP."""
    mapping: dict[str, str] = {}

    if REPO_WORKSPACES_FILE.exists():
        try:
            data = json.loads(REPO_WORKSPACES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for repo, path in data.items():
                    if isinstance(repo, str) and isinstance(path, str) and repo.strip() and path.strip():
                        mapping[_normalize_repo(repo)] = path.strip()
        except (OSError, json.JSONDecodeError):
            pass

    mapping.update(_parse_env_map())
    return mapping


def save_repo_workspaces(mapping: dict[str, str]) -> dict[str, str]:
    """Persist mappings to ~/.blaze/repos.json (env overrides are not written)."""
    cleaned: dict[str, str] = {}
    for repo, path in mapping.items():
        repo = _normalize_repo(repo)
        path = path.strip()
        if not repo or not path:
            continue
        if not _REPO_SLUG.match(repo):
            continue
        cleaned[repo] = path

    REPO_WORKSPACES_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPO_WORKSPACES_FILE.write_text(
        json.dumps(cleaned, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return cleaned


def resolve_repo_workspace(
    repo: str | None,
    *,
    extra: dict[str, str] | None = None,
) -> Path | None:
    """Return the local checkout for a GitHub repo slug, if configured and present."""
    if not repo or not repo.strip():
        return None

    repo = _normalize_repo(repo)
    candidates = {**load_repo_workspaces(), **(extra or {})}
    path_str = candidates.get(repo)
    if not path_str:
        return None

    path = Path(path_str).expanduser()
    if path.is_dir():
        return path.resolve()
    return None


def workspace_status(repo: str | None) -> dict[str, Any]:
    path = resolve_repo_workspace(repo)
    return {
        "repo": repo,
        "configured": path is not None,
        "path": str(path) if path else None,
    }
