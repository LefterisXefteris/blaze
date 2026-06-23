#!/usr/bin/env python3
"""Intent extraction worker — polls Redis queue or runs standalone."""

import asyncio
import json
import os
import signal
import sys
import time

# Load env from project root
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.services.agent.action_executor import process_session_intents

REDIS_URL = os.environ.get("REDIS_URL")
DEBOUNCE_MS = 2.0

_running = True


def _shutdown(*_args):
    global _running
    _running = False


async def run_inprocess_worker():
    """Fallback: no Redis — worker does nothing; FastAPI handles in-process."""
    print("No REDIS_URL — intent extraction runs in-process inside the API server.")
    while _running:
        await asyncio.sleep(60)


async def run_redis_worker():
    import redis.asyncio as redis

    client = redis.from_url(REDIS_URL, decode_responses=True)
    pending: dict[str, float] = {}

    print("Intent extraction worker listening (Redis)")

    while _running:
        now = time.time()
        ready = [sid for sid, t in list(pending.items()) if t <= now]
        for session_id in ready:
            pending.pop(session_id, None)
            try:
                await process_session_intents(session_id)
                print(f"Intent extraction completed for {session_id}")
            except Exception as error:
                print(f"Intent extraction failed for {session_id}: {error}")

        try:
            result = await client.blpop("intent-extraction:queue", timeout=1)
            if result:
                _, payload = result
                data = json.loads(payload)
                session_id = data["sessionId"]
                pending[session_id] = time.time() + DEBOUNCE_MS
        except Exception as error:
            print(f"Redis error: {error}")
            await asyncio.sleep(2)

    await client.close()


async def main():
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    if REDIS_URL:
        await run_redis_worker()
    else:
        await run_inprocess_worker()


if __name__ == "__main__":
    asyncio.run(main())
