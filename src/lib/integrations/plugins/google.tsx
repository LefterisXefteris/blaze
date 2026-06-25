import { ConnectionRegistry } from "../registry";

export const googlePlugin = ConnectionRegistry.register({
  slug: "google",
  order: 10,
  title: "Google Calendar",
  description: "Auto-create calendar events from conversations",
  notices: {
    connected: { success: "Google Calendar connected successfully." },
    error: {
      error:
        "Google Calendar connection failed. Check your OAuth credentials and redirect URLs, then try again.",
    },
    not_configured: {
      error:
        "Google isn't configured yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first (see below).",
    },
  },
  renderSetup({ status }) {
    const googleCallbackUrl = `${status.appUrl}/api/integrations/google/callback`;
    const googleLoginCallbackUrl = `${status.appUrl}/auth/callback`;

    return (
      <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
        <p className="font-medium">Set up Google Calendar (one-time)</p>
        <ol className="list-decimal pl-5 space-y-2 text-muted">
          <li>
            Go to{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              Google Cloud Console → Credentials
            </a>{" "}
            → <strong>Create OAuth client ID</strong> (Web application)
          </li>
          <li>
            Enable the <strong>Google Calendar API</strong> for your project
          </li>
          <li>
            Add authorized redirect URIs:
            <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`${googleLoginCallbackUrl}
${googleCallbackUrl}`}</pre>
          </li>
          <li>
            Copy <strong>Client ID</strong> and <strong>Client secret</strong> into{" "}
            <code>.env</code>:
            <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."`}</pre>
          </li>
          <li>
            Restart <code>npm run dev:all</code>, then click Connect Google Calendar below
          </li>
        </ol>
      </div>
    );
  },
  renderConnected() {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Blaze will create tentative calendar holds when it detects meetings in your notes
          and transcripts.
        </p>
        <a
          href="/api/integrations/google"
          className="inline-block text-sm text-link hover:underline"
        >
          Reconnect Google Calendar
        </a>
      </div>
    );
  },
});
