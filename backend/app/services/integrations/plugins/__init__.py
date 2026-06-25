"""Import plugins so they self-register with IntegrationRegistry.

To add a connection:
  1. Create ``plugins/<slug>.py`` with an IntegrationPlugin subclass.
  2. Add ``from app.services.integrations.plugins import <slug>`` below.
  3. Add a matching ``src/lib/integrations/plugins/<slug>.tsx`` and import it
     from ``src/lib/integrations/index.ts``.
"""

from app.services.integrations.plugins import github, google, slack

__all__ = ["github", "google", "slack"]
