import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import AppSession, require_auth
from app.config import get_settings

router = APIRouter(prefix="/api/transcription", tags=["transcription"])


@router.post("/elevenlabs-token")
async def create_elevenlabs_scribe_token(session: AppSession = Depends(require_auth)):
    """Mint a single-use ElevenLabs Scribe token for client-side realtime STT."""
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise HTTPException(503, "ElevenLabs not configured")

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
            headers={"xi-api-key": settings.elevenlabs_api_key},
        )

    if response.status_code != 200:
        detail = response.text[:200] if response.text else "token request failed"
        raise HTTPException(502, f"ElevenLabs token error: {detail}")

    data = response.json()
    token = data.get("token")
    if not token:
        raise HTTPException(502, "ElevenLabs returned no token")

    return {"token": token}
