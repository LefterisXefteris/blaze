from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    actions,
    context,
    integrations,
    local,
    notes,
    priority,
    recipes,
    sessions,
    slack,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Blaze API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(sessions.router)
    app.include_router(notes.router)
    app.include_router(actions.router)
    app.include_router(priority.router)
    app.include_router(recipes.router)
    app.include_router(context.router)
    app.include_router(integrations.router)
    app.include_router(local.router)
    app.include_router(slack.router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
