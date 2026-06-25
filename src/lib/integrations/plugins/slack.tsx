import { ConnectionRegistry } from "../registry";
import { pluginMetadata } from "../status";

export const slackPlugin = ConnectionRegistry.register({
  slug: "slack",
  order: 20,
  title: "Slack",
  description: "Capture Slack meetings & huddles — live notes like Granola",
  subtitle: (s) => (pluginMetadata(s, "slack").teamName as string | undefined) ?? null,
  notices: {
    connected: { success: "Slack connected successfully." },
    error: {
      error:
        "Slack connection failed. Check your app credentials and redirect URL, then try again.",
    },
    not_configured: {
      error:
        "Slack isn't configured yet — add credentials to .env first (see below).",
    },
  },
  renderSetup({ status }) {
    const slackCallbackUrl = `${status.appUrl}/api/integrations/slack/callback`;
    const slackEventsUrl = `${status.appUrl}/api/slack/events`;
    const slackInteractionsUrl = `${status.appUrl}/api/slack/interactions`;

    return (
      <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
        <p className="font-medium">Set up Slack (one-time)</p>
        <ol className="list-decimal pl-5 space-y-2 text-muted">
          <li>
            Go to{" "}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:underline"
            >
              api.slack.com/apps
            </a>{" "}
            → <strong>Create New App</strong> → From scratch → name it Blaze
          </li>
          <li>
            <strong>OAuth &amp; Permissions</strong> → Redirect URL:{" "}
            <code className="text-xs break-all">{slackCallbackUrl}</code>
          </li>
          <li>
            Add Bot Token Scopes:{" "}
            <code className="text-xs">channels:history</code>,{" "}
            <code className="text-xs">channels:read</code>,{" "}
            <code className="text-xs">channels:join</code>,{" "}
            <code className="text-xs">groups:history</code>,{" "}
            <code className="text-xs">groups:read</code>,{" "}
            <code className="text-xs">im:history</code>,{" "}
            <code className="text-xs">im:read</code>,{" "}
            <code className="text-xs">users:read</code>,{" "}
            <code className="text-xs">chat:write</code>,{" "}
            <code className="text-xs">canvases:write</code>
          </li>
          <li>
            Copy <strong>Client ID</strong>, <strong>Client Secret</strong>, and{" "}
            <strong>Signing Secret</strong> into <code>.env</code>:
            <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`SLACK_CLIENT_ID="..."
SLACK_CLIENT_SECRET="..."
SLACK_SIGNING_SECRET="..."`}</pre>
          </li>
          <li>Restart <code>npm run dev</code>, then click Connect Slack below</li>
          <li>
            (Required for live capture) <strong>Event Subscriptions</strong> → Enable → Request
            URL: <code className="text-xs break-all">{slackEventsUrl}</code> — use ngrok for
            local dev
          </li>
          <li>
            <strong>Interactivity</strong> → Enable → Request URL:{" "}
            <code className="text-xs break-all">{slackInteractionsUrl}</code>
          </li>
        </ol>
      </div>
    );
  },
  renderConnected({ status, updateSettings }) {
    const slack = pluginMetadata(status, "slack");
    const slackEventsUrl = `${status.appUrl}/api/slack/events`;
    const slackInteractionsUrl = `${status.appUrl}/api/slack/interactions`;

    return (
      <div className="space-y-3">
        <label className="flex items-center justify-between text-sm">
          <span>Auto-capture Slack huddles</span>
          <input
            type="checkbox"
            checked={slack.autoHuddleCapture !== false}
            onChange={(e) => updateSettings({ autoHuddleCapture: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Post live notes to Slack</span>
          <input
            type="checkbox"
            checked={slack.slackLiveNotes !== false}
            onChange={(e) => updateSettings({ slackLiveNotes: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Approve agent actions in Slack</span>
          <input
            type="checkbox"
            checked={slack.slackApprovals !== false}
            onChange={(e) => updateSettings({ slackApprovals: e.target.checked })}
          />
        </label>
        <p className="text-xs text-muted">
          When a huddle starts, Blaze opens a session, posts a live notes card in the huddle
          thread, and opens a <strong>canvas tab</strong> beside the meeting (canvas icon in the
          huddle bar). Type in the thread to feed notes — voice alone is not captured.
        </p>
        <div className="text-xs text-muted space-y-1 pt-2 border-t border-border-subtle">
          <p className="font-medium text-foreground">Slack app setup</p>
          <p>
            Event subscription URL:{" "}
            <code className="text-xs break-all">{slackEventsUrl}</code>
          </p>
          <p>
            Interactivity URL:{" "}
            <code className="text-xs break-all">{slackInteractionsUrl}</code>
          </p>
          <p>
            Subscribe to: <code>message.channels</code>, <code>message.groups</code>,{" "}
            <code>message.im</code>, <code>user_huddle_changed</code>
          </p>
          <p className="text-muted">
            Slack no longer lists <code>huddle_started</code> / <code>huddle_ended</code> —{" "}
            <code>user_huddle_changed</code> is the current event. Huddles are also detected via
            channel messages automatically.
          </p>
          <p>
            Invite the Blaze bot to channels you want to capture (or it will auto-join public
            channels).
          </p>
        </div>
      </div>
    );
  },
});
