"""Import plugins so they self-register with IntegrationRegistry."""

from app.services.integrations.plugins import github, google, slack

__all__ = ["github", "google", "slack"]
