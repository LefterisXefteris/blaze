from app.services.agent.blaze_pipeline import process_session


async def update_session_live_summary(session_id: str) -> None:
    await process_session(session_id)
