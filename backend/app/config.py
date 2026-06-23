from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env from repo root (parent of backend/)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# Query params Prisma adds that asyncpg cannot pass to connect()
_ASYNCPG_DROP_QUERY_PARAMS = frozenset({"pgbouncer", "connection_limit"})


def normalize_async_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    parsed = urlparse(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key not in _ASYNCPG_DROP_QUERY_PARAMS
    ]
    return urlunparse(parsed._replace(query=urlencode(query)))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    direct_url: str | None = None

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None

    app_url: str = "http://localhost:3000"
    redis_url: str | None = None

    google_client_id: str | None = None
    google_client_secret: str | None = None

    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_webhook_secret: str | None = None

    slack_client_id: str | None = None
    slack_client_secret: str | None = None
    slack_signing_secret: str | None = None

    openai_api_key: str | None = None
    dev_demo_login: bool = False
    blaze_handoff_dir: str | None = None
    blaze_cursor_handoff: str = "auto"
    blaze_cursor_rules: bool = True

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    @property
    def async_database_url(self) -> str:
        return normalize_async_database_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    import os

    return Settings(
        database_url=os.environ["DATABASE_URL"],
        supabase_url=os.environ.get(
            "NEXT_PUBLIC_SUPABASE_URL", os.environ.get("SUPABASE_URL", "")
        ),
        supabase_anon_key=os.environ.get(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY", os.environ.get("SUPABASE_ANON_KEY", "")
        ),
        supabase_service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
        supabase_jwt_secret=os.environ.get("SUPABASE_JWT_SECRET"),
        app_url=os.environ.get("NEXT_PUBLIC_APP_URL", os.environ.get("AUTH_URL", "http://localhost:3000")),
        cors_origins=[
            os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
            "http://localhost:3000",
            "http://localhost:3001",
        ],
        redis_url=os.environ.get("REDIS_URL"),
        google_client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        google_client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
        github_client_id=os.environ.get("GITHUB_CLIENT_ID"),
        github_client_secret=os.environ.get("GITHUB_CLIENT_SECRET"),
        github_webhook_secret=os.environ.get("GITHUB_WEBHOOK_SECRET"),
        slack_client_id=os.environ.get("SLACK_CLIENT_ID"),
        slack_client_secret=os.environ.get("SLACK_CLIENT_SECRET"),
        slack_signing_secret=os.environ.get("SLACK_SIGNING_SECRET"),
        openai_api_key=os.environ.get("OPENAI_API_KEY"),
        dev_demo_login=os.environ.get("DEV_DEMO_LOGIN", "").lower() == "true",
        blaze_handoff_dir=os.environ.get("BLAZE_HANDOFF_DIR"),
        blaze_cursor_handoff=os.environ.get("BLAZE_CURSOR_HANDOFF", "auto"),
        blaze_cursor_rules=os.environ.get("BLAZE_CURSOR_RULES", "true").lower()
        != "false",
    )
