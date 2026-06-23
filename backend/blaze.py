#!/usr/bin/env python3
"""Blaze CLI — local coding-agent handoffs."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

async def cmd_handoff(action_id: str, user_id: str | None, run: bool) -> int:
    if not user_id:
        print(
            "Error: pass --user-id or set BLAZE_USER_ID in .env",
            file=sys.stderr,
        )
        return 1

    from app.services.agent.coding_handoff import write_coding_handoff_file

    if run:
        result = await write_coding_handoff_file(action_id, user_id)
    else:
        from app.services.agent.coding_handoff import build_coding_handoff_markdown

        result = await build_coding_handoff_markdown(action_id, user_id)

    if result.get("error"):
        print(result["error"], file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="blaze", description="Blaze local dev tools")
    sub = parser.add_subparsers(dest="command", required=True)

    handoff = sub.add_parser("handoff", help="Build or write a coding handoff")
    handoff.add_argument("action_id", help="Blaze agent action ID")
    handoff.add_argument(
        "--run",
        action="store_true",
        help="Write handoff file, open in Cursor, and drop .cursor/rules snippet",
    )
    handoff.add_argument(
        "--user-id",
        default=os.environ.get("BLAZE_USER_ID"),
        help="Blaze user ID (default: BLAZE_USER_ID env)",
    )

    args = parser.parse_args()

    if args.command == "handoff":
        return asyncio.run(cmd_handoff(args.action_id, args.user_id, args.run))

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
