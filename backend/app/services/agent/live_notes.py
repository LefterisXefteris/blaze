from app.services.agent.graphs.live_notes_graph import run_live_notes_graph


async def update_session_live_summary(session_id: str) -> None:
    await run_live_notes_graph(session_id)
