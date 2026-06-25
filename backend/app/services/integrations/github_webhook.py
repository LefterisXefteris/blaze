import hashlib
import hmac

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import WebhookDelivery
from app.services.agent.github_processor import process_github_event


def verify_github_signature(payload: str, signature: str | None, secret: str) -> bool:
    if not signature:
        return False

    expected = "sha256=" + hmac.new(
        secret.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()

    try:
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False


async def handle_github_webhook(
    delivery_id: str,
    event: str,
    payload: dict,
) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
        )
        if result.scalar_one_or_none():
            return

        db.add(WebhookDelivery(id=delivery_id, provider="github"))
        await db.commit()

    await process_github_event(event, payload)
