import type { ConnectionPlugin } from "../types";
import { ConnectionRegistry } from "../registry";

export const githubPlugin: ConnectionPlugin = ConnectionRegistry.register({
  slug: "github",
  title: "GitHub",
  description: "Inbox for assignments, @mentions, and review requests",
  subtitle: (s) => (s.githubLogin ? `@${s.githubLogin}` : null),
  isConnected: (s) => s.github,
  isConfigured: (s) => s.githubConfigured,
  notices: {
    connected: { success: "GitHub connected successfully." },
    error: {
      error:
        "GitHub connection failed. Check your OAuth app credentials and callback URL, then try again.",
    },
    not_configured: {
      error:
        "GitHub isn't configured yet — add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env first (see below).",
    },
  },
  renderSetup({ status }) {
    const githubCallbackUrl = `${status.appUrl}/api/integrations/github/callback`;

    return (
      <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
        <p className="font-medium">Set up GitHub OAuth (one-time)</p>
        <ol className="list-decimal pl-5 space-y-2 text-muted">
          <li>
            Go to{" "}
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              GitHub → Settings → Developer settings → OAuth Apps
            </a>{" "}
            → <strong>New OAuth App</strong>
          </li>
          <li>
            <strong>Homepage URL:</strong> <code className="text-xs">{status.appUrl}</code>
          </li>
          <li>
            <strong>Authorization callback URL:</strong>{" "}
            <code className="text-xs break-all">{githubCallbackUrl}</code>
          </li>
          <li>
            Copy <strong>Client ID</strong> and generate a <strong>Client secret</strong> into{" "}
            <code>.env</code>:
            <pre className="mt-2 text-xs bg-surface p-2 rounded overflow-x-auto">{`GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"`}</pre>
          </li>
          <li>
            Restart <code>npm run dev:all</code>, then click Connect GitHub below.
          </li>
        </ol>
      </div>
    );
  },
  renderConnected({ status, updateSettings }) {
    const gh = status.githubSettings ?? {};

    return (
      <div className="space-y-2">
        <label className="flex items-center justify-between text-sm">
          <span>Auto-post ack on @mentions</span>
          <input
            type="checkbox"
            checked={gh.autoAckMention !== false}
            onChange={(e) => updateSettings({ autoAckMention: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Auto-add assignments</span>
          <input
            type="checkbox"
            checked={gh.autoAssign !== false}
            onChange={(e) => updateSettings({ autoAssign: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Auto-add @mentions</span>
          <input
            type="checkbox"
            checked={gh.autoMention !== false}
            onChange={(e) => updateSettings({ autoMention: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Auto-add review requests</span>
          <input
            type="checkbox"
            checked={gh.autoReview !== false}
            onChange={(e) => updateSettings({ autoReview: e.target.checked })}
          />
        </label>
        <p className="text-xs text-muted pt-2">
          Webhook URL (production):{" "}
          <code className="text-xs">
            {typeof window !== "undefined"
              ? `${window.location.origin}/api/github/webhook`
              : "/api/github/webhook"}
          </code>
        </p>
        <p className="text-xs text-muted">
          Local dev: GitHub cannot reach localhost — use <strong>Inbox → Sync mentions</strong>{" "}
          instead, or expose the app with ngrok and add the webhook above.
        </p>
      </div>
    );
  },
});
