from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

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

    # Avoid urlparse — Python 3.14 rejects [] in host/password as invalid IPv6.
    base, sep, query_str = url.partition("?")
    if not sep:
        return base

    query = [
        (key, value)
        for key, value in parse_qsl(query_str, keep_blank_values=True)
        if key not in _ASYNCPG_DROP_QUERY_PARAMS
    ]
    if not query:
        return base
    return f"{base}?{urlencode(query)}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    direct_url: str | None = None
    jwt_secret: str

    app_url: str = "http://localhost:3010"
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
    elevenlabs_api_key: str | None = None

    langfuse_enabled: bool = False
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_host: str = "http://localhost:3100"
    langfuse_live_notes_sample_rate: float = 0.2
    dev_demo_login: bool = False
    blaze_handoff_dir: str | None = None
    blaze_cursor_handoff: str = "auto"
    blaze_cursor_rules: bool = True

    cors_origins: list[str] = [
        "http://localhost:3010",
        "http://localhost:3000",
        "http://localhost:3001",
    ]

    @property
    def async_database_url(self) -> str:
        return normalize_async_database_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    import os

    jwt_secret = os.environ.get("BLAZE_JWT_SECRET")
    if not jwt_secret:
        raise RuntimeError("BLAZE_JWT_SECRET is required in .env")

    settings = Settings(
        database_url=os.environ["DATABASE_URL"],
        jwt_secret=jwt_secret,
        app_url=os.environ.get("NEXT_PUBLIC_APP_URL", os.environ.get("AUTH_URL", "http://localhost:3010")),
        cors_origins=[
            os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3010"),
            "http://localhost:3010",
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
        elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY"),
        langfuse_enabled=os.environ.get("LANGFUSE_ENABLED", "").lower() == "true",
        langfuse_public_key=os.environ.get("LANGFUSE_PUBLIC_KEY"),
        langfuse_secret_key=os.environ.get("LANGFUSE_SECRET_KEY"),
        langfuse_host=os.environ.get("LANGFUSE_HOST", "http://localhost:3100"),
        langfuse_live_notes_sample_rate=float(
            os.environ.get("LANGFUSE_LIVE_NOTES_SAMPLE_RATE", "0.2")
        ),
        dev_demo_login=os.environ.get("DEV_DEMO_LOGIN", "").lower() == "true",
        blaze_handoff_dir=os.environ.get("BLAZE_HANDOFF_DIR"),
        blaze_cursor_handoff=os.environ.get("BLAZE_CURSOR_HANDOFF", "auto"),
        blaze_cursor_rules=os.environ.get("BLAZE_CURSOR_RULES", "true").lower()
        != "false",
    )

    _apply_langfuse_env(settings)
    return settings


def _apply_langfuse_env(settings: Settings) -> None:
    """Point the Langfuse SDK at the local self-hosted instance (never Cloud by default)."""
    import os

    if settings.langfuse_public_key:
        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
    if settings.langfuse_secret_key:
        os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
    if settings.langfuse_host:
        os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host.rstrip("/"))
